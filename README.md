# WingMode

A prototype of **Wing Mode** for Hinge: an account owner swipes and gets their profile
reviewed while friends react live from their own phones.

## Setup

```bash
git clone https://github.com/Jason-15/TotallyNotHinge.git
cd TotallyNotHinge
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open <http://localhost:8000>.

Python 3.12+. No build step and no Node — the frontend is plain HTML, CSS and JavaScript
served by FastAPI.

## Accounts

| Who | Role | Opens |
|-----|------|-------|
| **Sheshu** | Account owner — swipes, and gets their profile reviewed | `/` → "Open Hinge as Sheshu" |
| **Jason** | Wing | `/friend` |
| **Julia** | Wing | `/friend` |
| **Sewon** | Wing (third seat) | `/friend` |

Sessions are capped at three wings.

Wings join in one of two ways: tap the invite link the owner shares, or open `/friend`,
sign in, and enter the session code from the top right of their own profile.

## Deploying

Push to GitHub and point Railway at the repo. `Procfile` and `railway.json` handle the rest.

**Keep it on a single replica.** Sessions are held in memory, so a second replica would
hold half of them and the app would look broken. `numReplicas: 1` is already set in
`railway.json`. A redeploy clears every live session — start a fresh one before demoing.
