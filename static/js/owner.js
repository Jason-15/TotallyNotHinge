/* The account owner's app.

   Screens are driven by one state snapshot from the server. Two transitions are
   automatic because the spec requires them: the session starting, and the recap
   appearing the moment a session ends (the owner should never have to go
   looking for it). Everything else is manual navigation. */

(() => {
  const body = document.body;
  const CODE = body.dataset.code;
  const PARTICIPANT = body.dataset.participant;

  let state = null;
  let lockTarget = 0;        // wall-clock ms when the decision window opens
  let openMatch = null;      // match currently being viewed in the conversation
  let seenMatches = new Set();
  let lastReactionId = null;

  /* ---------------------------------------------------------- utilities */

  const $ = (id) => document.getElementById(id);

  // The server resolves the element's label when the reaction is made, so this
  // reads correctly even on the conversation page, long after the deck moved on.
  function describeTarget(reaction, possessive) {
    return `${possessive} ${reaction.target_label || 'profile'}`;
  }

  function possessiveName(name) {
    return name.endsWith('s') ? `${name}'` : `${name}'s`;
  }

  /* ------------------------------------------------------------ routing */

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-goto]');
    if (!target) return;
    // Navigating away from Edit Profile must not silently drop the field the
    // owner is still typing in.
    if (WM.currentScreen() === 'edit') flushPendingEdit();
    WM.showScreen(target.dataset.goto);
    render();
  });

  /* ------------------------------------------------- entry + session type */

  $('open-wing-mode').addEventListener('click', () => {
    WM.showScreen('type');
  });

  /* Every Hinge profile carries the join affordance in its top right, the
     owner's included — being someone's wing isn't a separate mode you have to
     be invited into. */
  $('open-code').addEventListener('click', () => {
    WM.openCodeSheet({
      onSubmit: async (entered, errorEl) => {
        const response = await fetch(`/api/session/${entered}/preview`);
        if (!response.ok) {
          errorEl.textContent = "We couldn't find that session.";
          return;
        }
        window.location.href = `/j/${entered}`;
      }
    });
  });

  document.querySelectorAll('.choice').forEach((choice) => {
    choice.addEventListener('click', () => {
      document.querySelectorAll('.choice').forEach((other) => other.classList.remove('is-selected'));
      choice.classList.add('is-selected');
      WM.send('set_session_type', { session_type: choice.dataset.type });
    });
  });

  $('create-invite').addEventListener('click', () => {
    WM.showScreen('invite');
    render();
  });

  /* -------------------------------------------------------------- invite */

  function inviteUrl() {
    return `${location.origin}/j/${CODE}`;
  }

  function inviteMessage() {
    return `${state ? state.owner.name : 'Sheshu'} needs your expert opinion on Hinge — tap to join 🪽`;
  }

  /* Copies the whole pre-written invite — message and link together — because
     that's what actually gets pasted into iMessage. */
  $('copy-invite').addEventListener('click', async () => {
    const ok = await WM.copyText(`${inviteMessage()}\n${inviteUrl()}`);
    WM.toast(
      ok
        ? 'Invite copied — paste it into iMessage, WhatsApp, or a DM.'
        : 'Copy failed — select the message above manually.'
    );
  });

  /* The code on its own, for someone typing it into their own phone. */
  async function copyCode() {
    if (!state) return;
    const ok = await WM.copyText(state.code);
    if (!ok) {
      WM.toast('Copy failed — read the code out instead.');
      return;
    }
    const display = $('invite-code');
    display.classList.add('is-copied');
    setTimeout(() => display.classList.remove('is-copied'), 1400);
    WM.toast(`Code ${WM.esc(state.code)} copied.`);
  }

  $('copy-code').addEventListener('click', copyCode);
  $('invite-code').addEventListener('click', copyCode);

  $('share-invite').addEventListener('click', async () => {
    const payload = { text: inviteMessage(), url: inviteUrl() };
    // The real thing opens the OS share sheet — iMessage, WhatsApp, Instagram,
    // whatever the owner already uses. Desktop browsers fall back to a copy.
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (error) {
        return; // user dismissed the sheet
      }
    }
    $('copy-invite').click();
  });

  $('start-session').addEventListener('click', () => WM.send('start'));

  /* Logging out drops this session entirely — state lives on the server keyed
     by the code, so there's nothing local to clear beyond leaving the page. */
  $('logout').addEventListener('click', () => {
    const sheet = WM.openSheet(`
      <h3 class="sheet__title">Log out?</h3>
      <p class="note">This ends your Wing Mode session. Anyone you invited will be
      dropped, and the code stops working.</p>
      <div class="stack" style="padding: var(--s-5) 0 0;">
        <button class="btn btn--dark btn--block" id="logout-confirm">Log out</button>
        <button class="btn btn--quiet btn--block" id="logout-cancel">Stay signed in</button>
      </div>
    `);
    sheet.querySelector('#logout-cancel').addEventListener('click', WM.closeSheet);
    sheet.querySelector('#logout-confirm').addEventListener('click', () => {
      window.location.href = '/';
    });
  });

  /* --------------------------------------------------------- swipe deck */

  $('btn-like').addEventListener('click', () => WM.send('decide', { action: 'like' }));
  $('btn-pass').addEventListener('click', () => WM.send('decide', { action: 'pass' }));

  $('goto-review').addEventListener('click', () => WM.send('set_mode', { mode: 'review' }));
  $('goto-swipe').addEventListener('click', () => WM.send('set_mode', { mode: 'swipe' }));
  $('end-session').addEventListener('click', () => WM.send('end_session'));

  $('wing-badge').addEventListener('click', () => {
    const reactions = currentReactions();
    if (!reactions.length) return;
    const latest = reactions[reactions.length - 1];
    ProfileView.spotlight($('swipe-profile'), latest.target_type, latest.target_index);
  });

  function currentReactions() {
    return state && state.reactions ? state.reactions.current || [] : [];
  }

  /* ------------------------------------------------------------ settings */

  $('open-settings').addEventListener('click', openSettings);

  function openSettings() {
    const revealing = state.reveal_decisions;
    const sheet = WM.openSheet(`
      <h3 class="sheet__title">Wing Mode settings</h3>
      <div class="settings-row">
        <div>
          <div style="font-weight:600">Let friends see your Likes</div>
          <div class="note">When on, friends see “${WM.esc(state.owner.name)} liked him! 🎉” after a Like.
          Passes are never shown.</div>
        </div>
        <button class="switch ${revealing ? 'is-on' : ''}" id="toggle-reveal"><span class="switch__dot"></span></button>
      </div>
      <hr class="hairline">
      <div class="stack" style="padding: var(--s-4) 0 0;">
        <button class="btn btn--ghost btn--block" id="sheet-end">End session and see recap</button>
      </div>
    `);

    sheet.querySelector('#toggle-reveal').addEventListener('click', (event) => {
      const next = !event.currentTarget.classList.contains('is-on');
      event.currentTarget.classList.toggle('is-on', next);
      WM.send('set_reveal_decisions', { value: next });
    });

    sheet.querySelector('#sheet-end').addEventListener('click', () => {
      WM.closeSheet();
      WM.send('end_session');
    });
  }

  /* ------------------------------------------------------- conversation */

  $('matches-back').addEventListener('click', () => {
    WM.showScreen(state && state.status === 'ended' ? 'recap' : 'swipe');
    render();
  });

  $('convo-send').addEventListener('click', () => {
    const input = $('convo-input');
    if (!input.value.trim()) return;
    input.value = '';
    WM.toast('Message sent (prototype — no real messaging here).');
  });

  /* ------------------------------------------------------------ renders */

  function render() {
    if (!state) return;
    const screen = WM.currentScreen();

    if (screen === 'hub') renderHub();
    else if (screen === 'invite') renderInvite();
    else if (screen === 'swipe') renderSwipe();
    else if (screen === 'review') renderReview();
    else if (screen === 'recap') renderRecap();
    else if (screen === 'matches') renderMatches();
    else if (screen === 'convo') renderConvo();
    else if (screen === 'edit') renderEdit();
  }

  function renderHub() {
    $('hub-sub').textContent = `${state.owner_profile.name} · ${state.owner_profile.pronouns}`;
    const hasRecap = (state.suggestions || []).length > 0;
    $('hub-recap-link').hidden = !hasRecap;
    ProfileView.render($('hub-profile'), state.owner_profile, {
      attributions: state.attributions || []
    });
  }

  function renderInvite() {
    $('invite-copy').textContent = inviteMessage();
    $('invite-url').textContent = inviteUrl();
    $('invite-code').textContent = state.code;

    const friends = state.friends || [];
    const capacity = state.friend_capacity || 3;
    $('roster-count').textContent = `${friends.length} of ${capacity}`;

    const slots = [];
    friends.forEach((friend) => {
      slots.push(`
        <div class="roster__slot roster__slot--filled">
          ${WM.avatar(friend)}
          <div class="grow"><strong>${WM.esc(friend.name)}</strong></div>
          <span class="note" style="color: var(--like); font-weight:600;">Joined</span>
        </div>`);
    });
    for (let i = friends.length; i < capacity; i++) {
      slots.push(`
        <div class="roster__slot roster__slot--empty">
          <span class="avatar avatar--empty"></span>
          <div class="grow">Waiting for a friend…</div>
        </div>`);
    }
    $('roster').innerHTML = slots.join('');

    const start = $('start-session');
    start.disabled = friends.length === 0;
    start.textContent = friends.length
      ? `Start session with ${friends.map((f) => f.name).join(' and ')}`
      : 'Waiting for friends…';
  }

  function renderSwipe() {
    const profile = state.current_profile;
    $('deck-progress').textContent = profile
      ? `${state.deck_position + 1}/${state.deck_size}`
      : '';
    $('goto-review').hidden = state.session_type !== 'both';
    $('swipe-sub').textContent = `Wing Mode · ${(state.friends || []).map((f) => f.name).join(', ')}`;

    if (!profile) {
      $('swipe-profile').innerHTML = `
        <div class="hold">
          <div style="font-size:2rem">🎉</div>
          <h2 class="hold__title">That's everyone for now</h2>
          <p class="note">End the session to see what your friends suggested.</p>
          <button class="btn btn--primary" onclick="WM.send('end_session')">End session</button>
        </div>`;
      $('wing-badge').classList.add('hidden');
      return;
    }

    const reactions = currentReactions();
    const signature = `${profile.id}:${reactions.length}`;
    if ($('swipe-profile').dataset.signature !== signature) {
      ProfileView.render($('swipe-profile'), profile, { reactions });
      $('swipe-profile').dataset.signature = signature;
    }

    renderWingBadge(profile, reactions);
  }

  /* The Wing Badge — first of its three placements. It sits above the card,
     never on it, and only exists when a friend has reacted to this profile. */
  function renderWingBadge(profile, reactions) {
    const badge = $('wing-badge');
    if (!reactions.length) {
      badge.classList.add('hidden');
      return;
    }

    const seen = new Set();
    const distinct = [];
    reactions.forEach((reaction) => {
      if (!seen.has(reaction.friend_id)) {
        seen.add(reaction.friend_id);
        distinct.push(reaction);
      }
    });

    const latest = reactions[reactions.length - 1];
    $('wing-badge-initials').innerHTML = distinct.slice(0, 3).map((r) => WM.avatar(r)).join('');
    $('wing-badge-text').innerHTML =
      `${WM.esc(latest.friend_name)} reacted ${WM.esc(latest.emoji || '')} to ` +
      `${WM.esc(describeTarget(latest, possessiveName(profile.name)))}`;
    badge.classList.remove('hidden');
  }

  function renderReview() {
    $('goto-swipe').hidden = state.session_type !== 'both';
    const reactions = (state.reactions && state.reactions.owner_profile) || [];
    const names = (state.friends || []).map((f) => f.name).join(' and ');
    $('review-sub').textContent = names
      ? `${names} ${state.friends.length > 1 ? 'are' : 'is'} reviewing your profile`
      : 'Waiting for your friends';
    ProfileView.render($('review-profile'), state.owner_profile, {
      reactions,
      attributions: state.attributions || []
    });
  }

  /* ---------------------------------------------------- edit own profile */

  /* The owner's edits apply immediately, with no approval step — that's the
     asymmetry the whole feature rests on. A friend's input is a suggestion;
     the owner's is a change. */

  let photoDraft = null;      // working photo order while a drag is in progress
  let uploadingSlot = null;   // which slot the shared file input is aimed at
  let dragging = false;

  function renderEdit() {
    const profile = state.owner_profile;
    if (!photoDraft || photoDraft.length !== profile.photos.length) {
      photoDraft = profile.photos.map((_, index) => index);
    }
    // A state push arrives every time anyone reacts. Repainting a field the
    // owner is mid-sentence in would wipe what they typed, and repainting the
    // grid mid-drag would drop the tile, so both are skipped while in use.
    if (!dragging) paintEditPhotos();
    if (!isEditing('#edit-prompts')) paintEditPrompts();
    if (!isEditing('#edit-bio')) paintEditBio();
  }

  /* A field saves when it loses focus. Tapping Save (or Done) while still
     inside one would otherwise leave that last edit unsent, so blur first and
     let the change handlers fire. */
  function flushPendingEdit() {
    const active = document.activeElement;
    if (active && typeof active.blur === 'function' && active.tagName !== 'BODY') {
      active.blur();
    }
  }

  function markSaved(label = 'All changes saved') {
    const status = $('edit-status');
    if (!status) return;
    status.textContent = label;
    status.classList.add('is-flash');
    setTimeout(() => status.classList.remove('is-flash'), 900);
  }

  $('edit-save').addEventListener('click', () => {
    flushPendingEdit();
    // Give the blur-triggered change handlers a tick to send before confirming.
    setTimeout(() => {
      markSaved();
      WM.toast('Profile updated 🪽', { wing: true, duration: 1600 });
      WM.showScreen('hub');
      render();
    }, 60);
  });

  function isEditing(selector) {
    const host = document.querySelector(selector);
    return !!(host && document.activeElement && host.contains(document.activeElement));
  }

  function paintEditPhotos() {
    const profile = state.owner_profile;
    const grid = $('edit-photos');
    grid.innerHTML = photoDraft
      .map((originalIndex, position) => {
        const photo = profile.photos[originalIndex];
        return `
          <div class="reorder-tile" data-position="${position}">
            <img src="${WM.photoSrc(profile.id, photo, originalIndex)}" alt="">
            <span class="reorder-tile__index">${position + 1}</span>
            <span class="reorder-tile__swap">Replace</span>
          </div>`;
      })
      .join('');

    grid.querySelectorAll('.reorder-tile').forEach((tile) => attachPhotoDrag(tile));
  }

  /* Pointer events rather than native drag-and-drop, because this has to work
     with a thumb on a phone. A press that doesn't travel counts as a tap and
     opens the file picker instead of reordering. */
  function attachPhotoDrag(tile) {
    let origin = null;
    let moved = false;

    tile.addEventListener('pointerdown', (event) => {
      origin = { x: event.clientX, y: event.clientY };
      moved = false;
      tile.setPointerCapture(event.pointerId);
    });

    tile.addEventListener('pointermove', (event) => {
      if (!origin) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (!moved && Math.hypot(dx, dy) < 8) return;
      moved = true;
      dragging = true;
      tile.classList.add('is-dragging');
      tile.style.transform = `translate(${dx}px, ${dy}px)`;
      tile.style.zIndex = 5;
      const over = tileUnder(event.clientX, event.clientY, tile);
      document
        .querySelectorAll('#edit-photos .reorder-tile')
        .forEach((other) => other.classList.toggle('is-over', other === over));
    });

    const finish = (event) => {
      if (!origin) return;
      const over = moved ? tileUnder(event.clientX, event.clientY, tile) : null;
      tile.style.transform = '';
      tile.style.zIndex = '';
      tile.classList.remove('is-dragging');
      document
        .querySelectorAll('#edit-photos .reorder-tile')
        .forEach((other) => other.classList.remove('is-over'));
      const wasDrag = moved;
      const position = Number(tile.dataset.position);
      origin = null;
      moved = false;
      dragging = false;

      if (!wasDrag) {
        openPhotoPicker(position);
        return;
      }
      if (over && over !== tile) {
        const to = Number(over.dataset.position);
        const [item] = photoDraft.splice(position, 1);
        photoDraft.splice(to, 0, item);
        paintEditPhotos();
        WM.send('set_photo_order', { order: photoDraft });
        markSaved('Order saved');
        // The server reorders the list, so our draft is now the identity order.
        photoDraft = photoDraft.map((_, index) => index);
      }
    };

    tile.addEventListener('pointerup', finish);
    tile.addEventListener('pointercancel', finish);
  }

  function tileUnder(x, y, ignore) {
    ignore.style.pointerEvents = 'none';
    const element = document.elementFromPoint(x, y);
    ignore.style.pointerEvents = '';
    return element ? element.closest('#edit-photos .reorder-tile') : null;
  }

  function openPhotoPicker(position) {
    const profile = state.owner_profile;
    const photo = profile.photos[photoDraft[position]];
    uploadingSlot = photo && photo.slot != null ? photo.slot : position;
    const input = $('photo-input');
    input.value = ''; // so picking the same file twice still fires change
    input.click();
  }

  $('photo-input').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file || uploadingSlot == null) return;

    const body = new FormData();
    body.append('file', file);
    WM.toast('Uploading…', { duration: 1200 });
    try {
      const response = await fetch(`/api/session/${CODE}/photo/${uploadingSlot}`, {
        method: 'POST',
        body
      });
      const data = await response.json();
      if (!response.ok) {
        WM.toast(WM.esc(data.error || 'That upload failed.'));
        return;
      }
      WM.toast('Photo updated 🪽', { wing: true });
      markSaved('Photo saved');
    } catch (error) {
      WM.toast('Upload failed — check your connection.');
    } finally {
      uploadingSlot = null;
    }
  });

  function paintEditPrompts() {
    const prompts = state.owner_profile.prompts;
    $('edit-prompts').innerHTML = prompts
      .map(
        (prompt, index) => `
        <div class="edit-card">
          <label class="edit-field">
            <span class="edit-field__label">Prompt</span>
            <input type="text" data-prompt-q="${index}" value="${WM.esc(prompt.question)}" maxlength="80">
          </label>
          <label class="edit-field">
            <span class="edit-field__label">Your answer</span>
            <textarea data-prompt-a="${index}" rows="3" maxlength="280">${WM.esc(prompt.answer)}</textarea>
          </label>
        </div>`
      )
      .join('');

    $('edit-prompts').querySelectorAll('[data-prompt-q]').forEach((input) => {
      input.addEventListener('change', () => {
        WM.send('edit_prompt', { index: Number(input.dataset.promptQ), question: input.value });
        markSaved('Saved');
      });
    });
    $('edit-prompts').querySelectorAll('[data-prompt-a]').forEach((field) => {
      field.addEventListener('change', () => {
        WM.send('edit_prompt', { index: Number(field.dataset.promptA), answer: field.value });
        markSaved('Saved');
      });
    });
  }

  function paintEditBio() {
    const profile = state.owner_profile;
    const fields = [
      ['name', 'Name', 'text'],
      ['age', 'Age', 'number'],
      ['job', 'Work', 'text'],
      ['location', 'Location', 'text'],
      ['pronouns', 'Pronouns', 'text']
    ];
    $('edit-bio').innerHTML = `<div class="edit-card">${fields
      .map(
        ([key, label, type]) => `
        <label class="edit-field">
          <span class="edit-field__label">${label}</span>
          <input type="${type}" data-bio="${key}" value="${WM.esc(profile[key] == null ? '' : profile[key])}">
        </label>`
      )
      .join('')}</div>`;

    $('edit-bio').querySelectorAll('[data-bio]').forEach((input) => {
      input.addEventListener('change', () => {
        WM.send('edit_bio', { fields: { [input.dataset.bio]: input.value } });
        markSaved('Saved');
      });
    });
  }

  /* ---------------------------------------------------------------- recap */

  function renderRecap() {
    const recap = state.recap;
    if (!recap) return;

    const pending = (state.suggestions || []).filter((s) => s.status === 'pending').length;
    $('recap-sub').textContent = pending
      ? `${pending} suggestion${pending === 1 ? '' : 's'} to review`
      : 'All caught up';

    const parts = [];

    parts.push(`
      <div class="invite-message">
        Nothing here is live yet. Your profile only changes when you accept a suggestion,
        and you can undo any change.
      </div>`);

    /* ---- photos first, per spec ---- */
    parts.push('<div class="recap-section__title">Photos</div>');

    if (!recap.photos.order_suggestions.length && !recap.photos.reactions.length) {
      parts.push('<p class="note">No photo feedback this session.</p>');
    }

    recap.photos.order_suggestions.forEach((suggestion) => {
      parts.push(`
        <div class="suggestion ${statusClass(suggestion)}">
          <div class="suggestion__by">${WM.avatar(suggestion)} ${WM.esc(suggestion.friend_name)} suggested a new photo order</div>
          <div class="order-compare">
            <div class="order-compare__col">
              <div class="order-compare__label">Current</div>
              ${orderGrid(recap.photos.current)}
            </div>
            <div class="order-compare__col order-compare__col--new">
              <div class="order-compare__label">Suggested</div>
              ${orderGrid(suggestion.preview)}
            </div>
          </div>
          ${suggestionControls(suggestion, 'Use this order')}
        </div>`);
    });

    groupByTarget(recap.photos.reactions).forEach((group) => {
      parts.push(commentCard(group, recap.photos.current, 'photo'));
    });

    /* ---- then prompts ---- */
    parts.push('<div class="recap-section__title">Prompts</div>');

    if (!recap.prompts.edit_suggestions.length && !recap.prompts.reactions.length) {
      parts.push('<p class="note">No prompt feedback this session.</p>');
    }

    recap.prompts.edit_suggestions.forEach((suggestion) => {
      parts.push(`
        <div class="suggestion ${statusClass(suggestion)}">
          <div class="suggestion__by">
            ${WM.avatar(suggestion)} ${WM.esc(suggestion.friend_name)}
            ${suggestion.flagged ? '<span class="tag" style="color:var(--aubergine);border-color:var(--aubergine)">Flagged</span>' : ''}
          </div>
          <div class="prompt__q">${WM.esc(suggestion.question)}</div>
          <div class="diff" style="margin-top: var(--s-3)">
            <div class="diff__row diff__row--old">${WM.esc(suggestion.current_answer)}</div>
            <div class="diff__row diff__row--new">${WM.esc(suggestion.suggested_answer)}</div>
          </div>
          ${suggestionControls(suggestion, 'Use this answer')}
        </div>`);
    });

    groupByTarget(recap.prompts.reactions).forEach((group) => {
      parts.push(commentCard(group, recap.prompts.current, 'prompt'));
    });

    /* ---- restore + reciprocity ---- */
    if (recap.can_restore) {
      parts.push(`
        <hr class="hairline">
        <button class="btn btn--ghost btn--block" id="restore-original">
          Restore my original profile
        </button>
        <p class="note center">We saved everything before your first change.</p>`);
    }

    const friends = state.friends || [];
    if (friends.length) {
      parts.push(`
        <hr class="hairline">
        <div class="suggestion" style="background: linear-gradient(150deg, var(--wing-soft), #fff); border-color: var(--wing-line);">
          <div style="font-weight:650; margin-bottom: var(--s-2)">
            ${WM.esc(friends[0].name)} was a great wing — want to return the favor? 🪽
          </div>
          <p class="note">Start a Wing Mode session for them in one tap.</p>
          <button class="btn btn--primary btn--block" style="margin-top: var(--s-4)" id="reciprocate">
            Be ${WM.esc(possessiveName(friends[0].name))} wing
          </button>
        </div>`);
    }

    if ((state.matches || []).length) {
      parts.push(`
        <hr class="hairline">
        <button class="btn btn--ghost btn--block" data-goto="matches">
          See your ${state.matches.length} match${state.matches.length === 1 ? '' : 'es'} →
        </button>`);
    }

    $('recap-body').innerHTML = parts.join('');
    wireRecap();
  }

  function statusClass(suggestion) {
    if (suggestion.status === 'accepted') return 'is-accepted';
    if (suggestion.status === 'rejected') return 'is-rejected';
    return '';
  }

  function suggestionControls(suggestion, acceptLabel) {
    if (suggestion.status === 'accepted') {
      return `<div class="suggestion__resolved">✓ Applied to your profile</div>`;
    }
    if (suggestion.status === 'rejected') {
      return `<div class="suggestion__resolved">Dismissed</div>`;
    }
    return `
      <div class="suggestion__actions">
        <button class="btn btn--primary btn--sm grow" data-accept="${suggestion.id}">${acceptLabel}</button>
        <button class="btn btn--ghost btn--sm" data-reject="${suggestion.id}">Dismiss</button>
      </div>`;
  }

  function orderGrid(photos) {
    return `<div class="order-grid">${photos
      .map(
        (photo, index) => `
        <div class="order-grid__cell">
          <img src="${WM.photoSrc(state.owner_profile.id, photo, index)}" alt="">
          <span>${index + 1}</span>
        </div>`
      )
      .join('')}</div>`;
  }

  function groupByTarget(reactions) {
    const map = new Map();
    (reactions || []).forEach((reaction) => {
      const key = reaction.target_index;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(reaction);
    });
    return [...map.entries()].map(([index, items]) => ({ index, items }));
  }

  function commentCard(group, currentList, kind) {
    const item = currentList[group.index];
    const heading =
      kind === 'photo'
        ? `Your ${item && item.label ? item.label : `photo ${group.index + 1}`}`
        : `"${item ? item.question : 'Prompt'}"`;

    const media =
      kind === 'photo' && item
        ? `<img src="${WM.photoSrc(state.owner_profile.id, item, group.index)}" alt=""
             style="width:64px;height:80px;object-fit:cover;border-radius:var(--r-sm);flex:none">`
        : '';

    return `
      <div class="suggestion">
        <div class="row" style="align-items:flex-start; gap: var(--s-4)">
          ${media}
          <div class="grow">
            <div style="font-weight:650; margin-bottom: var(--s-3)">${WM.esc(heading)}</div>
            ${group.items
              .map(
                (reaction) => `
              <div class="reaction-note" style="margin-top:0;margin-bottom:8px;border-left-color:${WM.esc(reaction.accent)}">
                <strong>${WM.esc(reaction.friend_name)}</strong>
                ${reaction.emoji ? ' ' + WM.esc(reaction.emoji) : ''}
                ${reaction.text ? ' · ' + WM.esc(reaction.text) : ''}
              </div>`
              )
              .join('')}
          </div>
        </div>
      </div>`;
  }

  function wireRecap() {
    $('recap-body').querySelectorAll('[data-accept]').forEach((button) => {
      button.addEventListener('click', () => {
        WM.send('recap_action', { suggestion_id: button.dataset.accept, accepted: true });
      });
    });
    $('recap-body').querySelectorAll('[data-reject]').forEach((button) => {
      button.addEventListener('click', () => {
        WM.send('recap_action', { suggestion_id: button.dataset.reject, accepted: false });
      });
    });
    const restore = $('restore-original');
    if (restore) {
      restore.addEventListener('click', () => {
        WM.send('restore_original');
        WM.toast('Your original profile is back.');
      });
    }
    const reciprocate = $('reciprocate');
    if (reciprocate) {
      reciprocate.addEventListener('click', async () => {
        const response = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_type: 'both' })
        });
        const data = await response.json();
        window.location.href = data.owner_url;
      });
    }
  }

  /* ------------------------------------------------------------- matches */

  function renderMatches() {
    const matches = state.matches || [];
    if (!matches.length) {
      $('matches-body').innerHTML = '<p class="note">No matches yet.</p>';
      return;
    }
    $('matches-body').innerHTML = matches
      .map(
        (match) => `
      <button class="roster__slot" data-match="${match.id}" style="width:100%">
        <span class="slot-inner">
          <img class="convo__photo" src="${WM.photoUrl(match.profile_id, 0)}" alt="">
          <span class="grow">
            <strong>${WM.esc(match.name)}</strong>
            <span class="note" style="display:block">${
              match.reactions.length ? '🪽 A friend reacted to this profile' : 'New match'
            }</span>
          </span>
          <span class="muted">›</span>
        </span>
      </button>`
      )
      .join('');

    $('matches-body').querySelectorAll('[data-match]').forEach((node) => {
      node.addEventListener('click', () => {
        openMatch = matches.find((m) => m.id === node.dataset.match);
        WM.showScreen('convo');
        render();
      });
    });
  }

  /* The Wing Badge's second placement: a ready-made opener on the conversation
     page. Owner-only — the match sees a completely standard conversation. */
  function renderConvo() {
    if (!openMatch) return;
    const match = (state.matches || []).find((m) => m.id === openMatch.id) || openMatch;
    $('convo-title').textContent = match.name;

    const withEmoji = match.reactions.filter((r) => r.emoji || r.text);
    const badge = withEmoji.length ? withEmoji[0] : null;

    let badgeMarkup = '';
    if (badge && !match.badge_dismissed) {
      const where = describeTarget(badge, possessiveName(match.name));
      badgeMarkup = `
        <div class="opener-badge">
          ${WM.avatar(badge, true)}
          <div class="opener-badge__body">
            <div class="opener-badge__label">🪽 From your wing</div>
            <div class="opener-badge__text">
              ${WM.esc(badge.friend_name)} reacted ${WM.esc(badge.emoji || '')} to ${WM.esc(where)}
              ${badge.text ? `<br><em>“${WM.esc(badge.text)}”</em>` : ''}
            </div>
            <div class="opener-badge__privacy">Only you can see this.</div>
          </div>
          <button class="opener-badge__close" id="dismiss-badge" aria-label="Dismiss">✕</button>
        </div>`;
    }

    $('convo-body').innerHTML = `
      <div class="convo__header">
        <img class="convo__photo" src="${WM.photoUrl(match.profile_id, 0)}" alt="">
        <div>
          <div style="font-weight:650">${WM.esc(match.name)}</div>
          <div class="note">You matched — say something</div>
        </div>
      </div>
      ${badgeMarkup}
      <p class="note center" style="padding: var(--s-8) 0">
        This is a prototype conversation view.
      </p>`;

    const dismiss = $('dismiss-badge');
    if (dismiss) {
      dismiss.addEventListener('click', () => WM.send('dismiss_badge', { match_id: match.id }));
    }
  }

  /* --------------------------------------------------------- lock timing */

  function tickLock() {
    const ringPass = $('ring-pass');
    const ringLike = $('ring-like');
    const status = $('lock-status');
    if (!state || state.status !== 'active' || state.mode !== 'swipe' || !state.current_profile) {
      requestAnimationFrame(tickLock);
      return;
    }

    const remaining = Math.max(0, lockTarget - Date.now());
    const progress = remaining / 15000;
    ringPass.style.setProperty('--p', progress);
    ringLike.style.setProperty('--p', progress);

    const locked = remaining > 0;
    $('btn-like').disabled = locked;
    $('btn-pass').disabled = locked;

    if (locked) {
      const typers = state.typing_names || [];
      status.classList.remove('hidden');
      if (typers.length) {
        status.classList.add('lock-status--extended');
        status.textContent = `${typers.join(' and ')} ${typers.length > 1 ? 'are' : 'is'} reacting…`;
      } else {
        status.classList.remove('lock-status--extended');
        status.textContent = `Giving your wings a moment · ${Math.ceil(remaining / 1000)}s`;
      }
    } else {
      status.classList.add('hidden');
    }

    requestAnimationFrame(tickLock);
  }

  /* ---------------------------------------------------------- socket in */

  WM.on('state', ({ state: next }) => {
    const previousStatus = state ? state.status : null;
    const previousProfile = state && state.current_profile ? state.current_profile.id : null;
    state = next;

    // Re-arm the local countdown whenever the server's window moves.
    const nextProfile = state.current_profile ? state.current_profile.id : null;
    if (nextProfile !== previousProfile || lockTarget < Date.now()) {
      lockTarget = Date.now() + (state.lock_remaining_ms || 0);
    } else if (state.lock_remaining_ms > lockTarget - Date.now()) {
      lockTarget = Date.now() + state.lock_remaining_ms; // extended by a typing friend
    }

    // Automatic transitions: session start, and the recap on session end.
    if (previousStatus !== 'active' && state.status === 'active') {
      WM.showScreen(state.mode === 'review' ? 'review' : 'swipe');
    }
    if (previousStatus !== 'ended' && state.status === 'ended') {
      WM.showScreen('recap');
    }
    if (state.status === 'active') {
      const screen = WM.currentScreen();
      if (screen === 'swipe' && state.mode === 'review') WM.showScreen('review');
      if (screen === 'review' && state.mode === 'swipe') WM.showScreen('swipe');
    }

    render();
  });

  WM.on('participant_joined', ({ participant }) => {
    WM.toast(`${WM.esc(participant.name)} joined your session 🪽`, { wing: true });
  });

  WM.on('reaction_added', ({ reaction }) => {
    if (reaction.id === lastReactionId) return;
    lastReactionId = reaction.id;
    // Force a re-render of the current profile so the new reaction lands.
    const host = $('swipe-profile');
    if (host) host.dataset.signature = '';
  });

  WM.on('match_made', ({ match }) => {
    if (seenMatches.has(match.id)) return;
    seenMatches.add(match.id);
    const sheet = WM.openSheet(`
      <div class="match-hero">
        <div style="font-size:2.5rem">🎉</div>
        <h2 class="match-hero__title">It's a match</h2>
        <p class="note">You and ${WM.esc(match.name)} liked each other.</p>
        ${
          match.reactions.length
            ? `<p class="note" style="margin-top:var(--s-3)">🪽 Your wing reacted to this profile — we saved it as a conversation starter.</p>`
            : ''
        }
        <button class="btn btn--primary btn--block" style="margin-top: var(--s-5)" id="see-match">Open the conversation</button>
        <button class="btn btn--quiet btn--block" id="keep-swiping">Keep swiping</button>
      </div>`);
    sheet.querySelector('#see-match').addEventListener('click', () => {
      WM.closeSheet();
      openMatch = match;
      WM.showScreen('convo');
      render();
    });
    sheet.querySelector('#keep-swiping').addEventListener('click', WM.closeSheet);
  });

  WM.on('lock_extended', ({ friend_name }) => {
    WM.toast(`${WM.esc(friend_name)} is still typing — window extended`, { wing: true, duration: 2200 });
  });

  WM.on('error', ({ message }) => WM.toast(WM.esc(message)));

  WM.on('recap_actioned', () => {});

  /* ---------------------------------------------------------------- boot */

  WM.connect(CODE, PARTICIPANT);
  requestAnimationFrame(tickLock);
})();
