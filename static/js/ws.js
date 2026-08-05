/* Shared runtime: socket, screen switching, toasts, bottom sheets.
   Both the owner and friend apps are built on this. */

const WM = (() => {
  const handlers = {};
  let socket = null;
  let reconnectDelay = 500;
  let manualClose = false;
  let context = { code: null, participantId: null };

  /* ------------------------------------------------------------- socket */

  function connect(code, participantId) {
    context = { code, participantId };
    manualClose = false;
    open();
  }

  function open() {
    // wss:// behind Railway's TLS, ws:// on localhost.
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(
      `${scheme}//${location.host}/ws/${context.code}/${context.participantId}`
    );

    socket.addEventListener('open', () => {
      reconnectDelay = 500;
      emit('__open');
    });

    socket.addEventListener('message', (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      emit(payload.type, payload);
    });

    socket.addEventListener('close', () => {
      if (manualClose) return;
      // A phone that locks its screen drops the socket. Backing off and
      // retrying is what keeps a session alive across a demo.
      setTimeout(open, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.7, 8000);
    });
  }

  function send(type, payload = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  function on(type, handler) {
    (handlers[type] || (handlers[type] = [])).push(handler);
  }

  function emit(type, payload) {
    (handlers[type] || []).forEach((handler) => handler(payload));
  }

  /* ------------------------------------------------------------ screens */

  function showScreen(name) {
    /* Already here? Do nothing at all.

       The friend's router calls this on every state push, so with several
       people reacting it ran constantly. Each call re-toggled is-active — a
       display:none -> flex round trip, which is the flicker — and reset
       scrollTop, which is what kept yanking the reader back to the top.
       Resetting scroll is right when you actually navigate, and only then. */
    if (currentScreen() === name) return;

    document.querySelectorAll('[data-screen]').forEach((section) => {
      section.classList.toggle('is-active', section.dataset.screen === name);
    });
    const active = document.querySelector(`[data-screen="${name}"] .scroll`);
    if (active) active.scrollTop = 0;
  }

  function currentScreen() {
    const active = document.querySelector('[data-screen].is-active');
    return active ? active.dataset.screen : null;
  }

  /* ------------------------------------------------------------- toasts */

  function toast(message, { wing = false, duration = 3200 } = {}) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const node = document.createElement('div');
    node.className = 'toast' + (wing ? ' toast--wing' : '');
    node.innerHTML = message;
    host.appendChild(node);
    setTimeout(() => {
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 320);
    }, duration);
  }

  /* ------------------------------------------------------------- sheets */

  function openSheet(html) {
    const backdrop = document.getElementById('sheet-backdrop');
    const sheet = document.getElementById('sheet');
    sheet.innerHTML = '<div class="sheet__grip"></div>' + html;
    backdrop.classList.add('is-open');
    return sheet;
  }

  function closeSheet() {
    document.getElementById('sheet-backdrop').classList.remove('is-open');
  }

  document.addEventListener('click', (event) => {
    if (event.target.id === 'sheet-backdrop') closeSheet();
  });

  /* ------------------------------------------------------------ helpers */

  /* navigator.clipboard only exists in a secure context. That covers Railway
     (https) and localhost, but NOT a phone hitting the laptop over the LAN at
     http://192.168.x.x — where it's simply undefined and a copy would silently
     do nothing. The textarea fallback keeps working there. */
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        /* fall through */
      }
    }
    try {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(field);
      field.select();
      field.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      field.remove();
      return ok;
    } catch (error) {
      return false;
    }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function el(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function initials(name) {
    return String(name || '?').charAt(0).toUpperCase();
  }

  /* Accepts a participant, a reaction, or a suggestion — they all carry the
     same accent / initial / photo trio. Falls back to a coloured initial when
     there's no picture. */
  function avatar(who, large = false) {
    const size = large ? ' avatar--lg' : '';
    const name = who.name || who.friend_name || '';
    if (who.photo) {
      return `<img class="avatar${size}" src="${esc(who.photo)}" alt="${esc(name)}">`;
    }
    return `<span class="avatar${size}" style="background:${esc(
      who.accent || '#3E1768'
    )}">${esc(who.initial || initials(name))}</span>`;
  }

  /* The join-by-code sheet, shared by both apps — it hangs off the button in
     the top right of a profile. */
  function openCodeSheet({ onSubmit, title = 'Join a Wing Mode session' } = {}) {
    const sheet = openSheet(`
      <h3 class="sheet__title">${esc(title)}</h3>
      <p class="note">Enter the six-character code your friend sent you.</p>
      <input class="code-input" id="wm-code" maxlength="6" autocomplete="off"
             autocapitalize="characters" spellcheck="false" placeholder="ABC123"
             style="margin: var(--s-4) 0;">
      <div id="wm-code-error" class="note" style="color: var(--alert); min-height: 18px;"></div>
      <button class="btn btn--wing btn--block" id="wm-code-go" style="margin-top: var(--s-3)">Join session</button>
      <button class="btn btn--quiet btn--block" id="wm-code-cancel">Cancel</button>
    `);

    const field = sheet.querySelector('#wm-code');
    const error = sheet.querySelector('#wm-code-error');
    setTimeout(() => field.focus(), 60);

    const submit = async () => {
      const code = field.value.trim().toUpperCase();
      if (code.length < 4) {
        error.textContent = 'That code looks too short.';
        return;
      }
      error.textContent = '';
      await onSubmit(code, error);
    };

    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
    sheet.querySelector('#wm-code-go').addEventListener('click', submit);
    sheet.querySelector('#wm-code-cancel').addEventListener('click', closeSheet);
    return sheet;
  }

  /* Resolve one photo object to an image URL.
     A photo the owner uploaded in Edit Profile carries an explicit `url`; the
     seeded ones are addressed by their stable `slot`. Everything that draws a
     photo goes through here so an uploaded picture shows up in every surface —
     the card, the recap grid, the reorder tiles — not just the one you tested. */
  function photoSrc(profileId, photo, fallbackIndex) {
    if (photo && photo.url) return photo.url;
    const slot = photo && photo.slot != null ? photo.slot : fallbackIndex;
    return photoUrl(profileId, slot || 0);
  }

  function photoUrl(profileId, index) {
    return `/img/${encodeURIComponent(profileId)}/${index}`;
  }

  return {
    connect, send, on, emit,
    showScreen, currentScreen,
    toast, openSheet, closeSheet, openCodeSheet,
    esc, el, avatar, photoUrl, photoSrc, initials, copyText
  };
})();
