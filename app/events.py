"""WebSocket event names.

Kept in one place because both `app/main.py` and `static/js/ws.js` speak this
vocabulary; if you add an event, add it here first and mirror the string in the
client handler map.
"""

# Server -> client
STATE = "state"                          # full snapshot, sent on connect + after any structural change
PARTICIPANT_JOINED = "participant_joined"
PARTICIPANT_LEFT = "participant_left"
SESSION_STARTED = "session_started"
MODE_CHANGED = "mode_changed"            # owner switched between swiping and review in a "both" session
PROFILE_CHANGED = "profile_changed"      # everyone moves to the same deck profile
REACTION_ADDED = "reaction_added"
TYPING = "typing"                        # {friend_id, active}
LOCK_EXTENDED = "lock_extended"
OWNER_DECISION = "owner_decision"        # only broadcast to friends when reveal_decisions is on
MATCH_MADE = "match_made"                # owner only
SUGGESTION_ADDED = "suggestion_added"
SESSION_ENDED = "session_ended"
RECAP_ACTIONED = "recap_actioned"        # friends hear that the owner accepted something
ERROR = "error"

# Client -> server
JOIN = "join"
START = "start"
SET_SESSION_TYPE = "set_session_type"    # owner picks Review / Swiping / Both before starting
SET_MODE = "set_mode"
REACT = "react"
SET_TYPING = "set_typing"
DECIDE = "decide"                        # owner only: like / pass
SUGGEST_PHOTO_ORDER = "suggest_photo_order"
SUGGEST_PROMPT = "suggest_prompt"
END_SESSION = "end_session"
RECAP_ACTION = "recap_action"            # owner accepts / rejects one suggestion
RESTORE_ORIGINAL = "restore_original"
SET_REVEAL_DECISIONS = "set_reveal_decisions"
DISMISS_BADGE = "dismiss_badge"

# Owner editing their own profile in Edit Profile. Distinct from the friend
# suggestion flow: these apply straight away, with no approval step, because
# it's the owner's own profile.
EDIT_BIO = "edit_bio"
EDIT_PROMPT = "edit_prompt"
SET_PHOTO_ORDER = "set_photo_order"
