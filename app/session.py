"""In-memory session state for the Wing Mode demo.

Everything lives in a process-local dict. That is a deliberate prototype
tradeoff, and it is the reason the Railway service must run a single replica —
two replicas would each hold half the sessions and the demo would break in a way
that looks like a bug in the feature. A restart drops every live session.

The one rule enforced hard in here: a friend can never like or pass. There is no
code path that lets a non-owner participant change `deck_index` or record a
decision, because "friends can't swipe for you" is the trust promise the whole
feature rests on.
"""

import copy
import secrets
import time
from dataclasses import dataclass, field

from .data import profiles

# Ambiguous glyphs removed — these codes get read aloud and typed on phones.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6

MAX_FRIENDS = 3
DECISION_LOCK_MS = 15_000
# When a friend starts typing near the end of the window, give them room to
# finish the thought rather than letting the owner swipe out from under them.
EXTENSION_MS = 5_000
EXTENSION_THRESHOLD_MS = 3_000

# Friends are Hinge users here, so the welcome screen has a single Join button
# and no name field. To still tell two phones apart in a live demo, the server
# hands out the next free persona in this list. Accents come from Hinge's
# extended palette (Aubergine, Forest, Coral).
FRIEND_PERSONAS = [
    {"name": "Jason", "accent": "#025656", "photo_id": "jason"},
    {"name": "Julia", "accent": "#D45847", "photo_id": "julia"},
    # Third seat exists so the 3-friend cap can be demonstrated.
    {"name": "Sewon", "accent": "#75457D", "photo_id": "sewon"},
]

EMOJI_CHOICES = ["🔥", "👀", "❤️", "😬"]


def now_ms():
    return int(time.time() * 1000)


@dataclass
class Participant:
    id: str
    name: str
    role: str  # "owner" | "friend"
    accent: str
    initial: str
    joined_at: int
    photo_id: str = None

    def public(self):
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "accent": self.accent,
            "initial": self.initial,
            "photo": f"/img/{self.photo_id}/0" if self.photo_id else None,
        }


@dataclass
class Session:
    code: str
    session_type: str  # "review" | "swipe" | "both"
    owner: Participant
    friends: list = field(default_factory=list)
    status: str = "waiting"  # waiting | active | ended
    mode: str = "swipe"  # active surface when session_type is "both"

    reveal_decisions: bool = True

    deck: list = field(default_factory=profiles.deck)
    deck_index: int = 0
    locked_until: int = 0

    owner_profile: dict = field(default_factory=profiles.new_owner_profile)
    owner_profile_backup: dict = None

    # profile_id -> [reaction]; covers both the Discover deck and the owner's
    # own profile, so one renderer handles both surfaces.
    reactions: dict = field(default_factory=dict)
    suggestions: list = field(default_factory=list)
    decisions: list = field(default_factory=list)
    matches: list = field(default_factory=list)
    attributions: list = field(default_factory=list)

    # Photos the owner uploaded in Edit Profile, held in memory rather than
    # written to disk: Railway's filesystem is ephemeral, so a written file would
    # not survive a restart anyway, and keeping them here also stops one demo
    # session overwriting another's photos.
    uploads: dict = field(default_factory=dict)      # upload_id -> (content_type, bytes)
    # Keyed by the photo's stable `slot`, never by its position in the list, so
    # a replaced photo follows its slot through a reorder or a restore.
    photo_overrides: dict = field(default_factory=dict)  # slot -> url

    typing: dict = field(default_factory=dict)  # friend_id -> expires_at ms
    sockets: dict = field(default_factory=dict)  # participant_id -> WebSocket
    created_at: int = field(default_factory=now_ms)

    _counter: int = 0

    # ------------------------------------------------------------------ ids

    def next_id(self, prefix):
        self._counter += 1
        return f"{prefix}{self._counter}"

    # ------------------------------------------------------- participants

    def add_friend(self, preferred_name=None):
        """Claim a persona, or None when the session is full.

        `preferred_name` is the account the friend is already signed in as on
        their own phone. If someone else in the session has taken it, they fall
        through to the next free one rather than being turned away.
        """
        if len(self.friends) >= MAX_FRIENDS:
            return None
        taken = {f.name for f in self.friends}
        persona = None
        if preferred_name:
            persona = next(
                (p for p in FRIEND_PERSONAS if p["name"] == preferred_name and p["name"] not in taken),
                None,
            )
        if persona is None:
            persona = next((p for p in FRIEND_PERSONAS if p["name"] not in taken), None)
        if persona is None:
            return None
        friend = Participant(
            id=self.next_id("f"),
            name=persona["name"],
            role="friend",
            accent=persona["accent"],
            initial=persona["name"][0],
            joined_at=now_ms(),
            photo_id=persona.get("photo_id"),
        )
        self.friends.append(friend)
        return friend

    def participant(self, participant_id):
        if participant_id == self.owner.id:
            return self.owner
        return next((f for f in self.friends if f.id == participant_id), None)

    def everyone(self):
        return [self.owner] + self.friends

    # -------------------------------------------------------------- swipe

    def current_profile(self):
        if not self.deck or self.deck_index >= len(self.deck):
            return None
        return self.deck[self.deck_index]

    def start(self):
        self.status = "active"
        self.mode = "review" if self.session_type == "review" else "swipe"
        self.arm_lock()

    def arm_lock(self):
        self.locked_until = now_ms() + DECISION_LOCK_MS
        self.typing.clear()

    def lock_remaining(self):
        return max(0, self.locked_until - now_ms())

    def can_decide(self):
        return self.lock_remaining() <= 0

    def note_typing(self, friend_id, active):
        """Returns True when this typing event pushed the decision window out."""
        if not active:
            self.typing.pop(friend_id, None)
            return False
        self.typing[friend_id] = now_ms() + EXTENSION_MS
        remaining = self.lock_remaining()
        if 0 < remaining < EXTENSION_THRESHOLD_MS:
            self.locked_until = now_ms() + EXTENSION_MS
            return True
        return False

    def active_typers(self):
        current = now_ms()
        return [
            self.participant(fid).name
            for fid, expires in list(self.typing.items())
            if expires > current and self.participant(fid)
        ]

    def record_decision(self, action):
        """Owner likes or passes the current profile. Returns (decision, match)."""
        profile = self.current_profile()
        if profile is None:
            return None, None

        decision = {"profile_id": profile["id"], "action": action, "at": now_ms()}
        self.decisions.append(decision)

        match = None
        if action == "like" and profile.get("matches_back"):
            match = {
                "id": self.next_id("m"),
                "profile_id": profile["id"],
                "name": profile["name"],
                # Snapshot the reactions now: the badge on the conversation page
                # has to survive even after the session ends.
                "reactions": copy.deepcopy(self.reactions.get(profile["id"], [])),
                "badge_dismissed": False,
                "at": now_ms(),
            }
            self.matches.append(match)

        self.deck_index += 1
        self.arm_lock()
        return decision, match

    # ----------------------------------------------------------- reactions

    def profile_by_id(self, profile_id):
        if profile_id == self.owner_profile["id"]:
            return self.owner_profile
        return next((p for p in self.deck if p["id"] == profile_id), None)

    def _target_label(self, profile_id, target_type, target_index):
        """Human phrase for the element reacted to, resolved at reaction time.

        Captured now rather than looked up later because the Wing Badge on the
        conversation page has to say "his hiking photo" long after the deck has
        moved past that profile.
        """
        profile = self.profile_by_id(profile_id)
        if profile is None:
            return "their profile"
        if target_type == "photo":
            photos = profile.get("photos", [])
            if 0 <= target_index < len(photos):
                return photos[target_index].get("label") or f"photo {target_index + 1}"
            return f"photo {target_index + 1}"
        prompts = profile.get("prompts", [])
        if 0 <= target_index < len(prompts):
            return f"“{prompts[target_index]['question']}” prompt"
        return "prompt"

    def add_reaction(self, friend, profile_id, target_type, target_index, emoji, text):
        reaction = {
            "id": self.next_id("r"),
            "friend_id": friend.id,
            "friend_name": friend.name,
            "accent": friend.accent,
            "initial": friend.initial,
            "photo": f"/img/{friend.photo_id}/0" if friend.photo_id else None,
            "profile_id": profile_id,
            "target_type": target_type,  # "photo" | "prompt"
            "target_index": target_index,
            "target_label": self._target_label(profile_id, target_type, target_index),
            "emoji": emoji,
            "text": (text or "").strip()[:180] or None,
            "at": now_ms(),
        }
        self.reactions.setdefault(profile_id, []).append(reaction)
        return reaction

    def reactions_for(self, profile_id):
        return self.reactions.get(profile_id, [])

    # --------------------------------------------------------- suggestions

    def suggest_photo_order(self, friend, order):
        """One ordering per friend — a resubmission replaces the previous one."""
        valid = list(range(len(self.owner_profile["photos"])))
        if sorted(order) != valid:
            return None
        self.suggestions = [
            s
            for s in self.suggestions
            if not (s["kind"] == "photo_order" and s["friend_id"] == friend.id)
        ]
        suggestion = {
            "id": self.next_id("s"),
            "kind": "photo_order",
            "friend_id": friend.id,
            "friend_name": friend.name,
            "accent": friend.accent,
            "initial": friend.initial,
            "photo": f"/img/{friend.photo_id}/0" if friend.photo_id else None,
            "order": order,
            "status": "pending",
            "at": now_ms(),
        }
        self.suggestions.append(suggestion)
        return suggestion

    def suggest_prompt(self, friend, prompt_index, suggested_answer, flagged):
        if not (0 <= prompt_index < len(self.owner_profile["prompts"])):
            return None
        suggestion = {
            "id": self.next_id("s"),
            "kind": "prompt_edit",
            "friend_id": friend.id,
            "friend_name": friend.name,
            "accent": friend.accent,
            "initial": friend.initial,
            "photo": f"/img/{friend.photo_id}/0" if friend.photo_id else None,
            "prompt_index": prompt_index,
            "question": self.owner_profile["prompts"][prompt_index]["question"],
            "current_answer": self.owner_profile["prompts"][prompt_index]["answer"],
            "suggested_answer": (suggested_answer or "").strip()[:280],
            "flagged": bool(flagged),
            "status": "pending",
            "at": now_ms(),
        }
        self.suggestions.append(suggestion)
        return suggestion

    # --------------------------------------------------------------- recap

    # ------------------------------------------------- owner edits own profile

    MAX_UPLOAD_BYTES = 8 * 1024 * 1024
    ALLOWED_UPLOAD_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif")

    def replace_photo(self, slot, content_type, data):
        """Swap the image behind one photo slot. Returns an error string or None."""
        slots = {p.get("slot") for p in self.owner_profile["photos"]}
        if slot not in slots:
            return "That photo slot doesn't exist."
        if content_type not in self.ALLOWED_UPLOAD_TYPES:
            return "That file type isn't supported — use a JPEG, PNG, WebP or GIF."
        if not data:
            return "That file was empty."
        if len(data) > self.MAX_UPLOAD_BYTES:
            return "That image is too large — keep it under 8MB."

        upload_id = self.next_id("u")
        self.uploads[upload_id] = (content_type, data)
        self.photo_overrides[slot] = f"/u/{self.code}/{upload_id}"
        return None

    def edit_bio(self, fields):
        """Update the owner's headline details. Unknown keys are ignored."""
        changed = False
        for key in ("name", "job", "location", "pronouns"):
            if key in fields:
                value = str(fields[key]).strip()[:60]
                if value:
                    self.owner_profile[key] = value
                    changed = True
        if "age" in fields:
            try:
                age = int(fields["age"])
                if 18 <= age <= 99:
                    self.owner_profile["age"] = age
                    changed = True
            except (TypeError, ValueError):
                pass
        if changed and self.owner.name != self.owner_profile["name"]:
            self.owner.name = self.owner_profile["name"]
            self.owner.initial = self.owner_profile["name"][:1].upper()
        return changed

    def edit_prompt(self, index, question=None, answer=None):
        prompts = self.owner_profile["prompts"]
        if not (0 <= index < len(prompts)):
            return False
        if question is not None:
            text = str(question).strip()[:80]
            if text:
                prompts[index]["question"] = text
        if answer is not None:
            prompts[index]["answer"] = str(answer).strip()[:280]
        return True

    def set_photo_order(self, order):
        """The owner reordering their own photos, distinct from accepting a
        friend's suggested order."""
        base = self.owner_profile["photos"]
        if sorted(order) != list(range(len(base))):
            return False
        self.owner_profile["photos"] = [copy.deepcopy(base[i]) for i in order]
        return True

    def _with_photo_urls(self, profile):
        """Attach any uploaded image URL to each photo, resolved by slot."""
        if not self.photo_overrides:
            return profile
        decorated = copy.deepcopy(profile)
        for photo in decorated.get("photos", []):
            url = self.photo_overrides.get(photo.get("slot"))
            if url:
                photo["url"] = url
        return decorated

    # ---------------------------------------------------------------- recap

    def _backup_once(self):
        if self.owner_profile_backup is None:
            self.owner_profile_backup = copy.deepcopy(self.owner_profile)

    def _photo_base(self):
        """The photo list that suggestion `order` indices refer to.

        Friends build an ordering against the profile as it looked when they saw
        it. Once the owner accepts one reorder the live profile has moved, so
        every later index lookup has to resolve against the pre-change snapshot
        or the second suggestion would scramble the photos.
        """
        if self.owner_profile_backup is not None:
            return self.owner_profile_backup["photos"]
        return self.owner_profile["photos"]

    def act_on_suggestion(self, suggestion_id, accepted):
        suggestion = next((s for s in self.suggestions if s["id"] == suggestion_id), None)
        if suggestion is None or suggestion["status"] != "pending":
            return None

        if not accepted:
            suggestion["status"] = "rejected"
            return suggestion

        self._backup_once()

        if suggestion["kind"] == "photo_order":
            base = self._photo_base()
            self.owner_profile["photos"] = [copy.deepcopy(base[i]) for i in suggestion["order"]]
            self.attributions.append(
                {
                    "element": "photos",
                    "label": "Photo order",
                    "friend_name": suggestion["friend_name"],
                    "accent": suggestion["accent"],
                }
            )
        elif suggestion["kind"] == "prompt_edit":
            index = suggestion["prompt_index"]
            self.owner_profile["prompts"][index]["answer"] = suggestion["suggested_answer"]
            self.attributions.append(
                {
                    "element": f"prompt:{index}",
                    "label": suggestion["question"],
                    "friend_name": suggestion["friend_name"],
                    "accent": suggestion["accent"],
                }
            )

        suggestion["status"] = "accepted"
        return suggestion

    def restore_original(self):
        if self.owner_profile_backup is None:
            return False
        self.owner_profile = copy.deepcopy(self.owner_profile_backup)
        self.attributions.clear()
        for suggestion in self.suggestions:
            if suggestion["status"] == "accepted":
                suggestion["status"] = "pending"
        return True

    def recap(self):
        """Suggestions grouped for the owner: photos first, then prompts."""
        owner_reactions = self.reactions_for(self.owner_profile["id"])
        photo_reactions = [r for r in owner_reactions if r["target_type"] == "photo"]
        prompt_reactions = [r for r in owner_reactions if r["target_type"] == "prompt"]
        base = self._with_photo_urls({"photos": self._photo_base()})["photos"]
        current = self._with_photo_urls(self.owner_profile)

        return {
            "photos": {
                "current": current["photos"],
                "reactions": photo_reactions,
                "order_suggestions": [
                    dict(s, preview=[base[i] for i in s["order"]])
                    for s in self.suggestions
                    if s["kind"] == "photo_order"
                ],
            },
            "prompts": {
                "current": current["prompts"],
                "reactions": prompt_reactions,
                "edit_suggestions": [s for s in self.suggestions if s["kind"] == "prompt_edit"],
            },
            "can_restore": self.owner_profile_backup is not None,
            "accepted_count": len([s for s in self.suggestions if s["status"] == "accepted"]),
        }

    def end(self):
        self.status = "ended"
        self.locked_until = 0

    # --------------------------------------------------------------- state

    def state_for(self, participant_id):
        """Snapshot tailored to the viewer.

        Friends never receive the owner's decisions, matches, or (when the owner
        has turned reveal off) anything about likes and passes.
        """
        viewer = self.participant(participant_id)
        is_owner = viewer is not None and viewer.role == "owner"
        profile = self.current_profile()

        state = {
            "code": self.code,
            "session_type": self.session_type,
            "status": self.status,
            "mode": self.mode,
            "you": viewer.public() if viewer else None,
            "owner": self.owner.public(),
            "friends": [f.public() for f in self.friends],
            "friend_capacity": MAX_FRIENDS,
            "owner_profile": self._with_photo_urls(self.owner_profile),
            "emoji_choices": EMOJI_CHOICES,
            "deck_position": self.deck_index,
            "deck_size": len(self.deck),
            "current_profile": profile,
            "lock_remaining_ms": self.lock_remaining() if self.status == "active" else 0,
            "typing_names": self.active_typers(),
            "reveal_decisions": self.reveal_decisions,
            "reactions": {
                "current": self.reactions_for(profile["id"]) if profile else [],
                "owner_profile": self.reactions_for(self.owner_profile["id"]),
            },
            "suggestions": self.suggestions,
            "server_time": now_ms(),
        }

        if is_owner:
            state["matches"] = self.matches
            state["decisions"] = self.decisions
            state["attributions"] = self.attributions
            # Always computed: the recap opens automatically at session end, but
            # the owner can also revisit it later from Edit Profile.
            state["recap"] = self.recap()

        return state


class SessionStore:
    def __init__(self):
        self._sessions = {}

    def create(self, session_type="both", owner_name=None):
        code = self._mint_code()
        owner_profile = profiles.new_owner_profile()
        owner = Participant(
            id="owner",
            name=owner_name or owner_profile["name"],
            role="owner",
            accent="#3E1768",  # Hinge Midnight
            initial=(owner_name or owner_profile["name"])[0],
            joined_at=now_ms(),
            photo_id=owner_profile["id"],
        )
        session = Session(code=code, session_type=session_type, owner=owner)
        session.owner_profile = owner_profile
        self._sessions[code] = session
        return session

    def get(self, code):
        if not code:
            return None
        return self._sessions.get(code.upper())

    def _mint_code(self):
        while True:
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
            if code not in self._sessions:
                return code

    def prune(self, max_age_ms=6 * 60 * 60 * 1000):
        """Drop sessions older than six hours so a long-lived deploy doesn't grow forever."""
        cutoff = now_ms() - max_age_ms
        for code in [c for c, s in self._sessions.items() if s.created_at < cutoff]:
            del self._sessions[code]


store = SessionStore()
