"""WingMode — a Hinge prototype.

One FastAPI process serves the pages, the placeholder photography, and a
WebSocket per participant. Every mutation follows the same shape: validate the
caller's role, mutate the session, broadcast a transient event for toasts and
animations, then push a fresh per-viewer state snapshot so nobody has to
reconcile deltas on the client.
"""

import hashlib
from pathlib import Path

from fastapi import FastAPI, File, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import events as ev
from .data import photos, profiles
from .session import FRIEND_PERSONAS, MAX_FRIENDS, store

BASE_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(title="WingMode", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")

INVITE_TEMPLATE = "{name} needs your expert opinion on Hinge — tap to join 🪽"


# --------------------------------------------------------------- broadcasting


async def _send(socket, payload):
    try:
        await socket.send_json(payload)
    except Exception:
        # A phone that locked its screen mid-demo shows up here. The socket gets
        # cleaned up on the disconnect path; swallowing keeps one dead client
        # from breaking the broadcast for everyone else.
        pass


async def push_state(session):
    """Send every connected participant their own tailored snapshot."""
    for participant_id, socket in list(session.sockets.items()):
        await _send(socket, {"type": ev.STATE, "state": session.state_for(participant_id)})


async def broadcast(session, payload, to_role=None, exclude=None):
    for participant_id, socket in list(session.sockets.items()):
        if exclude and participant_id == exclude:
            continue
        if to_role:
            participant = session.participant(participant_id)
            if participant is None or participant.role != to_role:
                continue
        await _send(socket, payload)


# --------------------------------------------------------------------- pages


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/owner/{code}", response_class=HTMLResponse)
async def owner_page(request: Request, code: str):
    session = store.get(code)
    if session is None:
        return _expired(request)
    return templates.TemplateResponse(
        request, "owner.html", {"code": session.code, "participant_id": session.owner.id}
    )


@app.get("/friend", response_class=HTMLResponse)
async def friend_home(request: Request):
    """A friend opening Hinge normally.

    They sign in as themselves and land on their own profile, where the
    join-by-code button sits in the top right. No session code in the URL.
    """
    return templates.TemplateResponse(
        request, "friend.html", {"code": "", "accounts": profiles.FRIEND_PROFILES}
    )


@app.get("/j/{code}", response_class=HTMLResponse)
async def join_page(request: Request, code: str):
    """The link friends receive. Skips straight to the Wing Mode welcome screen."""
    session = store.get(code)
    if session is None:
        return _expired(request)
    return templates.TemplateResponse(
        request, "friend.html", {"code": session.code, "accounts": profiles.FRIEND_PROFILES}
    )


def _expired(request):
    return templates.TemplateResponse(
        request,
        "index.html",
        {"error": "That session has expired. Sessions are cleared when the server restarts."},
        status_code=404,
    )


# ----------------------------------------------------------------------- API


@app.post("/api/session")
async def create_session(payload: dict):
    session_type = payload.get("session_type", "both")
    if session_type not in ("review", "swipe", "both"):
        session_type = "both"
    store.prune()
    session = store.create(session_type=session_type)
    return {
        "code": session.code,
        "owner_url": f"/owner/{session.code}",
        "join_path": f"/j/{session.code}",
        "invite_message": INVITE_TEMPLATE.format(name=session.owner.name),
    }


@app.get("/api/session/{code}/preview")
async def session_preview(code: str):
    """What the friend's welcome screen needs before they commit to joining."""
    session = store.get(code)
    if session is None:
        return JSONResponse({"error": "not_found"}, status_code=404)
    return {
        "code": session.code,
        "owner_name": session.owner.name,
        "owner_photo": f"/img/{session.owner_profile['id']}/0",
        "status": session.status,
        "friends": [f.public() for f in session.friends],
        "full": len(session.friends) >= MAX_FRIENDS,
        "next_persona": _next_persona_name(session),
        "explainer": (
            f"You're {session.owner.name}'s wing. React to their profile and swipe "
            "with them — only they can see your input."
        ),
    }


def _next_persona_name(session):
    taken = {f.name for f in session.friends}
    persona = next((p for p in FRIEND_PERSONAS if p["name"] not in taken), None)
    return persona["name"] if persona else None


@app.post("/api/session/{code}/join")
async def join_session(code: str, payload: dict = None):
    session = store.get(code)
    if session is None:
        return JSONResponse({"error": "not_found"}, status_code=404)

    preferred = (payload or {}).get("persona")
    friend = session.add_friend(preferred_name=preferred)
    if friend is None:
        return JSONResponse({"error": "session_full"}, status_code=409)

    await broadcast(session, {"type": ev.PARTICIPANT_JOINED, "participant": friend.public()})
    await push_state(session)
    return {"participant_id": friend.id, "participant": friend.public()}


@app.get("/img/{profile_id}/{index}")
async def photo(profile_id: str, index: int):
    """Serve a real photo if one exists, otherwise the generated fallback.

    Everything here is sent `no-cache`, which means "revalidate before reusing"
    rather than "never cache". Dropping a real photo into static/img/ changes
    what this slot returns, and a long max-age would leave browsers showing the
    old placeholder for a day after the file lands — which looks exactly like
    the photo failing to load. Revalidation still 304s when nothing changed, so
    it stays cheap.
    """
    real = photos.find_real_photo(profile_id, index)
    if real is not None:
        # Starlette attaches ETag + Last-Modified from the file itself, so a
        # replaced file is picked up on the next request.
        return FileResponse(real, headers={"Cache-Control": "no-cache"})

    profile = profiles.profile_by_id(profile_id)
    caption = ""
    if profile and 0 <= index < len(profile["photos"]):
        caption = profile["photos"][index].get("caption", "")
    svg = photos.render_svg(profile_id, index, caption)
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={
            "Cache-Control": "no-cache",
            "ETag": '"' + hashlib.md5(svg.encode()).hexdigest() + '"',
        },
    )


@app.post("/api/session/{code}/photo/{slot}")
async def upload_photo(code: str, slot: int, file: UploadFile = File(...)):
    """Replace one of the owner's photos from Edit Profile.

    The bytes are kept in the session rather than written to static/img: Railway's
    filesystem is ephemeral so a written file wouldn't survive a restart, and
    holding it per-session stops one demo overwriting another's photos.
    """
    session = store.get(code)
    if session is None:
        return JSONResponse({"error": "not_found"}, status_code=404)

    data = await file.read()
    error = session.replace_photo(slot, file.content_type, data)
    if error:
        return JSONResponse({"error": error}, status_code=400)

    await push_state(session)
    return {"ok": True, "url": session.photo_overrides[slot]}


@app.get("/u/{code}/{upload_id}")
async def uploaded_photo(code: str, upload_id: str):
    session = store.get(code)
    if session is None or upload_id not in session.uploads:
        return Response(status_code=404)
    content_type, data = session.uploads[upload_id]
    # Immutable: a new upload always gets a fresh id, so this can be cached hard.
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@app.get("/healthz")
async def healthz():
    return {"ok": True}


# ----------------------------------------------------------------- WebSocket


@app.websocket("/ws/{code}/{participant_id}")
async def websocket_endpoint(websocket: WebSocket, code: str, participant_id: str):
    session = store.get(code)
    if session is None:
        await websocket.close(code=4404)
        return

    participant = session.participant(participant_id)
    if participant is None:
        await websocket.close(code=4403)
        return

    await websocket.accept()
    session.sockets[participant_id] = websocket
    await _send(websocket, {"type": ev.STATE, "state": session.state_for(participant_id)})
    await push_state(session)

    try:
        while True:
            message = await websocket.receive_json()
            await handle_message(session, participant, message)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if session.sockets.get(participant_id) is websocket:
            del session.sockets[participant_id]
        await broadcast(session, {"type": ev.PARTICIPANT_LEFT, "participant_id": participant_id})
        await push_state(session)


async def handle_message(session, participant, message):
    action = message.get("type")
    is_owner = participant.role == "owner"

    # ---- owner-only controls -------------------------------------------
    # Friends have no like/pass path anywhere in the API. This is the trust
    # promise of the feature, so it is enforced server-side and not just by
    # hiding buttons in the friend UI.
    if action in (
        ev.START,
        ev.SET_SESSION_TYPE,
        ev.SET_MODE,
        ev.DECIDE,
        ev.END_SESSION,
        ev.RECAP_ACTION,
        ev.RESTORE_ORIGINAL,
        ev.SET_REVEAL_DECISIONS,
        ev.DISMISS_BADGE,
        ev.EDIT_BIO,
        ev.EDIT_PROMPT,
        ev.SET_PHOTO_ORDER,
    ) and not is_owner:
        await _send(
            session.sockets.get(participant.id),
            {"type": ev.ERROR, "message": "Only the account owner can do that."},
        )
        return

    if action == ev.SET_SESSION_TYPE:
        # Only meaningful before the session starts; afterwards the surfaces are
        # already live on the friends' phones.
        session_type = message.get("session_type")
        if session.status == "waiting" and session_type in ("review", "swipe", "both"):
            session.session_type = session_type
            await push_state(session)

    elif action == ev.START:
        if not session.friends:
            return
        session.start()
        await broadcast(session, {"type": ev.SESSION_STARTED, "mode": session.mode})
        await push_state(session)

    elif action == ev.SET_MODE:
        mode = message.get("mode")
        if mode in ("swipe", "review") and session.session_type == "both":
            session.mode = mode
            if mode == "swipe":
                session.arm_lock()
            await broadcast(session, {"type": ev.MODE_CHANGED, "mode": mode})
            await push_state(session)

    elif action == ev.DECIDE:
        if session.status != "active" or session.mode != "swipe":
            return
        if not session.can_decide():
            await _send(
                session.sockets.get(participant.id),
                {"type": ev.ERROR, "message": "Give your wings a second to weigh in."},
            )
            return

        decision, match = session.record_decision(message.get("action"))
        if decision is None:
            return

        if decision["action"] == "like" and session.reveal_decisions:
            await broadcast(
                session,
                {"type": ev.OWNER_DECISION, "action": "like", "owner_name": session.owner.name},
                to_role="friend",
            )
        # The friend's card closes the moment the owner acts, whether or not the
        # decision itself is revealed — that is the signal the window is over.
        await broadcast(session, {"type": ev.PROFILE_CHANGED, "index": session.deck_index})
        if match:
            await broadcast(session, {"type": ev.MATCH_MADE, "match": match}, to_role="owner")
        await push_state(session)

    elif action == ev.REACT:
        if participant.role != "friend":
            return
        profile_id = message.get("profile_id")
        current = session.current_profile()
        # A friend may only react to what the session is actually showing.
        allowed = {session.owner_profile["id"]}
        if current:
            allowed.add(current["id"])
        if profile_id not in allowed:
            return

        reaction = session.add_reaction(
            participant,
            profile_id,
            message.get("target_type"),
            int(message.get("target_index", 0)),
            message.get("emoji"),
            message.get("text"),
        )
        session.note_typing(participant.id, False)
        await broadcast(session, {"type": ev.REACTION_ADDED, "reaction": reaction})
        await push_state(session)

    elif action == ev.SET_TYPING:
        if participant.role != "friend":
            return
        extended = session.note_typing(participant.id, bool(message.get("active")))
        await broadcast(
            session,
            {
                "type": ev.TYPING,
                "friend_name": participant.name,
                "accent": participant.accent,
                "active": bool(message.get("active")),
            },
        )
        if extended:
            await broadcast(
                session,
                {
                    "type": ev.LOCK_EXTENDED,
                    "friend_name": participant.name,
                    "lock_remaining_ms": session.lock_remaining(),
                },
            )
        await push_state(session)

    elif action == ev.SUGGEST_PHOTO_ORDER:
        if participant.role != "friend":
            return
        order = [int(i) for i in message.get("order", [])]
        suggestion = session.suggest_photo_order(participant, order)
        if suggestion:
            await broadcast(session, {"type": ev.SUGGESTION_ADDED, "suggestion": suggestion})
            await push_state(session)

    elif action == ev.SUGGEST_PROMPT:
        if participant.role != "friend":
            return
        suggestion = session.suggest_prompt(
            participant,
            int(message.get("prompt_index", 0)),
            message.get("suggested_answer"),
            message.get("flagged"),
        )
        if suggestion:
            await broadcast(session, {"type": ev.SUGGESTION_ADDED, "suggestion": suggestion})
            await push_state(session)

    elif action == ev.SET_REVEAL_DECISIONS:
        session.reveal_decisions = bool(message.get("value"))
        await push_state(session)

    elif action == ev.END_SESSION:
        session.end()
        await broadcast(session, {"type": ev.SESSION_ENDED, "owner_name": session.owner.name})
        await push_state(session)

    elif action == ev.RECAP_ACTION:
        suggestion = session.act_on_suggestion(message.get("suggestion_id"), bool(message.get("accepted")))
        if suggestion and suggestion["status"] == "accepted":
            await broadcast(
                session,
                {
                    "type": ev.RECAP_ACTIONED,
                    "owner_name": session.owner.name,
                    "friend_id": suggestion["friend_id"],
                },
                to_role="friend",
            )
        await push_state(session)

    elif action == ev.RESTORE_ORIGINAL:
        session.restore_original()
        await push_state(session)

    # ---- the owner editing their own profile ---------------------------
    # These apply immediately with no approval step. That asymmetry is the
    # point: a friend's input is a suggestion, the owner's is a change.
    elif action == ev.EDIT_BIO:
        if session.edit_bio(message.get("fields") or {}):
            await push_state(session)

    elif action == ev.EDIT_PROMPT:
        if session.edit_prompt(
            int(message.get("index", -1)),
            question=message.get("question"),
            answer=message.get("answer"),
        ):
            await push_state(session)

    elif action == ev.SET_PHOTO_ORDER:
        if session.set_photo_order([int(i) for i in message.get("order", [])]):
            await push_state(session)

    elif action == ev.DISMISS_BADGE:
        match_id = message.get("match_id")
        for match in session.matches:
            if match["id"] == match_id:
                match["badge_dismissed"] = True
        await push_state(session)
