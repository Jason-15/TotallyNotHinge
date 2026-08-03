# WingMode — a Hinge prototype

A working prototype of **Wing Mode**: a social layer inside Hinge that brings friends into the two
moments Gen Z finds most vulnerable — building a profile and deciding who to Like — without the account
owner giving up control.

Three people, three phones, one live session. The owner swipes and gets their profile reviewed; their
friends react in real time and suggest changes. Nothing touches the profile without the owner's approval.

---

## Run it locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open <http://localhost:8000>.

## The cast

Three real people run the demo. The profiles they swipe on are Springfield, because the copy lands
harder when you already know the person.

| Who | Role |
|-----|------|
| **Sheshu** | Account owner — swipes, and gets their profile reviewed |
| **Jason** | Wing |
| **Julia** | Wing |
| **Sewon** | Wing (3rd seat) — fills the cap when you want to show a session full |

The Discover deck is five Springfield men — Homer, Moe, Ned Flanders, Krusty and Comic Book Guy — with
six real photos each.

**Homer and Moe are seeded to match back**, so a Like on either one produces a match every time — a demo
can't rely on chance. **Comic Book Guy is the 😬 card**: his prompts reliably get a reaction out of the room.

Sheshu's profile is seeded so Profile Review has an obvious payoff: the one good photo is buried at
position 4 behind a gym-bathroom mirror selfie, and "A life goal of mine" currently answers
*"Idk. Be happy I guess?"*

## Two ways to join

Both work, and both are worth showing.

1. **The invite link** — the owner shares it, the friend taps it, and lands straight on the Wing Mode
   welcome screen.
2. **The code, from your own profile** — a friend opens Hinge as they normally would, lands on their own
   profile, and taps **🪽 Enter code** in the top right. That button sits on *every* profile, the owner's
   included, because being someone's wing shouldn't require being invited into a separate mode.

Because two phones need to be told apart, `/friend` starts with a one-tap "who's phone is this?" screen.
That step doesn't exist in the real app — you'd already be signed in — and it's the only shim in the flow.

## The demo script

Roughly six minutes. One laptop for Sheshu, two phones for Jason and Julia.

| # | Who | What to do | What it demonstrates |
|---|-----|-----------|----------------------|
| 1 | Sheshu | "Open Hinge as Sheshu" → tap **🪽 Wing Mode**, top left | One tap from your own profile into the flow |
| 2 | Sheshu | Pick **Both** (pre-selected) → "Get invite link" | Session types, with Both recommended |
| 3 | Sheshu | **Share invite** | Real OS share sheet — iMessage, WhatsApp, IG |
| 4 | Jason & Julia | Open `/friend`, sign in, tap **🪽 Enter code** | The join affordance on your own profile |
| 5 | Sheshu | Watch them appear | Live waiting room, no refresh |
| 6 | Sheshu | **Start session** | Everyone lands on Homer at the same moment |
| 7 | Julia | React 😬 to Homer's donut photo | Reactions target a *specific* photo, not the profile |
| 8 | Sheshu | Try to Like immediately | Buttons locked — the ring drains for 15 seconds |
| 9 | Jason | Start typing as the ring runs out | Window extends; Sheshu sees "Jason is reacting…" |
| 10 | Sheshu | Tap the **Wing Badge** | Scrolls straight to the reacted photo and flashes it |
| 11 | Sheshu | Like Homer | Wings see "Sheshu liked him! 🎉"; a match fires |
| 12 | Sheshu | Open the conversation | Wing Badge as a ready-made opener, owner-only |
| 13 | Sheshu | Switch to **Review** | Wings move to Profile Review too |
| 14 | Jason & Julia | **Reorder** tab — drag the sunrise photo to first | Drag-and-drop suggestion |
| 15 | Julia | **Prompts** tab — rewrite the weak life-goal answer | Suggested edits, not direct edits |
| 16 | Sheshu | **End** | Recap opens on its own — no going looking for it |
| 17 | Sheshu | Accept the reorder | Side-by-side, one tap. Wings get "Sheshu loved your suggestions" |
| 18 | Sheshu | **Restore my original profile** | Everything is reversible, always |

## What's built

**Swiping Together** — profile-level sync, a 15-second decision lock enforced on the server (not just a
disabled button), extension when a friend is typing, emoji + text reactions on individual photos and
prompts, friends seeing each other's reactions, and the friend's card closing in sync with the owner's
decision.

**Profile Review** — emoji and comments on photos and prompts, drag-and-drop photo reordering, prompt
rewrite suggestions, and a recap that opens automatically at session end with photos first, then prompts.
Side-by-side order comparison, per-suggestion accept/reject, automatic backup, one-tap restore.

**Wing Badge**, in all three placements — above the deck during swiping (tap to jump to the exact
element), on the conversation page as an opener after a match, and as "Suggested by Jason" attribution in
Edit Profile.

**Post-session** — closure for friends, a live notification when their suggestion is actually used, and a
reciprocity prompt for the owner.

### Deliberately not built
Non-Hinge guest join (all three participants are Hinge users), voice/video prompts, date ideas, polls,
photo removal, and the V2 prompt library. Messaging in the conversation view is a stub.

## Trust model

Two rules are enforced on the server, not just hidden in the UI, because they're the promises the whole
feature rests on:

- **Friends can never Like or Pass.** No API path lets a non-owner record a decision or advance the deck.
- **Reactions are owner-only.** They're never sent to the person being swiped on, and friend clients never
  receive the owner's decisions or matches at all. Turning off "let friends see your Likes" stops the
  broadcast at the server, not at the client.

## Design

The theme follows Hinge's published brand guidelines: the core palette is Hinge Black `#1A1A1A` and Hinge
White `#FFFEFD`, and the guideline is explicit that black and white carry **at least 90%** of any surface
with the rest of the palette never exceeding 10%. So the app is monochrome, and Midnight `#3E1768` is
reserved almost entirely for Wing Mode itself — which is exactly what makes the feature legible as a new
layer rather than a redecoration.

Hinge sets headlines in Tiempos Headline and functional text in Modern Era. Both are licensed, so
`tokens.css` uses the closest widely available stand-ins — a transitional serif and a large-x-height
grotesque. Swapping in the real faces is a two-line change if the team has licences.

## Artwork

The five Discover profiles ship with **real photos** — 30 screenshots pulled from the Simpsons wiki,
centre-cropped to 3:4 and normalised to 900×1200. They live in `static/img/<profile-id>/`.

The account owner and the wings are still on **generated fallback artwork** — original vector portraits
built from primitives in `app/data/photos.py`. Drop your own photos into `static/img/sheshu/`,
`static/img/jason/` and `static/img/julia/` and they take over immediately; the generated art is only
what renders when a slot has no file, so nothing can fail to load mid-demo.

Friends' comments on a photo render as **margin cards over the top-right of the image**, Google Docs
style, rather than stacking underneath it — a comment arriving mid-session then costs nothing in layout,
so the feed never reflows and shoves the next photo down under whoever is reading. Comments on a prompt
stay in normal flow, where a prompt card can grow to fit them.

**On the source material:** the deck images are copyrighted Simpsons frames, used here for a school
presentation. That's a classroom/fair-use context, not a cleared commercial one — swap them for original
personas before this is ever shown as a real product pitch or shared publicly. Every folder is already
set up for that: replace the files and nothing else changes.

## Deploying to Railway

Push the repo and point Railway at it. `railway.json` and the `Procfile` handle the rest.

**It must run a single replica.** Sessions live in process memory, so a second replica would hold half the
sessions and the feature would appear broken rather than misconfigured. `numReplicas: 1` is set in
`railway.json` — leave it there. A redeploy or restart clears every live session, so start a fresh one
before you present. Sessions older than six hours are pruned automatically.

## Layout

```
app/
  main.py          routes, REST, WebSocket dispatch, photo endpoint
  session.py       session state, roles, decision lock, recap
  events.py        WebSocket event vocabulary
  data/profiles.py Sheshu's profile, the 10-profile deck, the wings' profiles
  data/photos.py   real-photo lookup + generated fallback artwork
static/css/        tokens (the Hinge palette), shared chrome, owner, friend
static/js/         ws (socket + code sheet), profile (shared renderer), owner, friend
templates/         landing, owner shell, friend shell
```

Both role apps are single documents that swap sections, so the WebSocket survives every screen change — a
full navigation per step would drop and rejoin the session, which is exactly what breaks during a live
demo.
