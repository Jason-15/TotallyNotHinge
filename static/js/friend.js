/* The friend's app.

   Deliberately sparse: the profile, and a way to react to any single element on
   it. There is no Like or Pass control anywhere in here — friends influence the
   decision, they never make it. */

(() => {
  const body = document.body;
  const ACCOUNTS = JSON.parse(document.getElementById('accounts-data').textContent || '[]');

  // Set when arriving via an invite link; otherwise the friend types it in.
  let code = body.dataset.code || '';
  let account = null;                 // which Hinge account this phone is signed into
  let participantId = null;

  const storageKey = () => `wingmode:${code}`;

  let state = null;
  let reviewTab = 'photos';
  let draftOrder = null;       // local photo ordering while dragging
  let lastProfileId = null;
  let typingTimer = null;

  const $ = (id) => document.getElementById(id);

  /* --------------------------------------------------------- signing in */

  /* A demo shim for "log in as you usually would". Two phones need to be
     distinguishable, and in the real app this step doesn't exist — you're
     already signed in. */
  function renderLogin() {
    $('account-list').innerHTML = ACCOUNTS.map(
      (acct) => `
        <button class="roster__slot" data-account="${WM.esc(acct.id)}" style="width:100%">
          <span class="slot-inner">
            <img class="avatar avatar--lg" src="/img/${WM.esc(acct.id)}/0" alt="">
            <span class="grow">
              <strong>${WM.esc(acct.name)}</strong>
              <span class="note" style="display:block">${WM.esc(acct.age)} · ${WM.esc(acct.job)}</span>
            </span>
            <span class="muted">›</span>
          </span>
        </button>`
    ).join('');

    $('account-list').querySelectorAll('[data-account]').forEach((node) => {
      node.addEventListener('click', () => {
        account = ACCOUNTS.find((a) => a.id === node.dataset.account);
        localStorage.setItem('wingmode:account', account.id);
        afterLogin();
      });
    });
  }

  function afterLogin() {
    // Arrived via an invite link — skip the home screen and go straight to the
    // Wing Mode welcome, which is what tapping a link should do.
    if (code) {
      loadWelcome();
      return;
    }
    renderHome();
  }

  function renderHome() {
    WM.showScreen('home');
    $('home-sub').textContent = `${account.name} · ${account.location}`;
    ProfileView.render($('home-profile'), account, {});
  }

  /* ------------------------------------------------------ join by code */

  $('open-code').addEventListener('click', () => {
    WM.openCodeSheet({
      onSubmit: async (entered, errorEl) => {
        const response = await fetch(`/api/session/${entered}/preview`);
        if (!response.ok) {
          errorEl.textContent = "We couldn't find that session.";
          return;
        }
        code = entered;
        WM.closeSheet();
        loadWelcome(await response.json());
      }
    });
  });

  $('welcome-back').addEventListener('click', () => {
    if (account) renderHome();
    else WM.showScreen('login');
  });

  $('full-back').addEventListener('click', () => {
    if (account) renderHome();
    else WM.showScreen('login');
  });

  /* ------------------------------------------------------ welcome screen */

  async function loadWelcome(preview) {
    if (!preview) {
      const response = await fetch(`/api/session/${code}/preview`);
      if (!response.ok) {
        WM.showScreen('full');
        $('full-title').textContent = 'Session not found';
        $('full-body').textContent = 'That code may have expired. Ask your friend for a new one.';
        return;
      }
      preview = await response.json();
    }

    WM.showScreen('welcome');
    $('welcome-photo').src = preview.owner_photo;
    $('welcome-title').textContent = `${preview.owner_name} wants your take`;
    // The privacy promise, stated before the friend commits to anything.
    $('welcome-explainer').innerHTML =
      `You're ${WM.esc(preview.owner_name)}'s wing. React to their profile and swipe with them — ` +
      `<em>only they can see your input.</em>`;

    if (preview.full) {
      WM.showScreen('full');
      return;
    }

    const joiningAs = (account && account.name) || preview.next_persona;
    $('welcome-as').textContent = joiningAs ? `Joining as ${joiningAs}` : '';
  }

  $('join-button').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Joining…';

    const response = await fetch(`/api/session/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: account ? account.name : null })
    });

    button.disabled = false;
    button.textContent = 'Join Session';

    if (response.status === 409) {
      WM.showScreen('full');
      return;
    }
    if (!response.ok) {
      WM.toast('Could not join — try again.');
      return;
    }

    const data = await response.json();
    participantId = data.participant_id;
    // Survives a reload so a friend who refreshes rejoins as themselves rather
    // than burning another one of the three seats.
    sessionStorage.setItem(storageKey(), participantId);
    WM.connect(code, participantId);
    WM.showScreen('joined');
  });

  /* Signing out forgets which account this phone is, and leaves any session
     it had joined — otherwise the next person to pick up the phone inherits
     the previous demo run. */
  $('logout').addEventListener('click', () => {
    const sheet = WM.openSheet(`
      <h3 class="sheet__title">Log out?</h3>
      <p class="note">You'll be asked whose phone this is again, and you'll leave
      any Wing Mode session you've joined.</p>
      <div class="stack" style="padding: var(--s-5) 0 0;">
        <button class="btn btn--dark btn--block" id="logout-confirm">Log out</button>
        <button class="btn btn--quiet btn--block" id="logout-cancel">Stay signed in</button>
      </div>
    `);
    sheet.querySelector('#logout-cancel').addEventListener('click', WM.closeSheet);
    sheet.querySelector('#logout-confirm').addEventListener('click', () => {
      localStorage.removeItem('wingmode:account');
      if (code) sessionStorage.removeItem(storageKey());
      window.location.href = '/friend';
    });
  });

  /* ----------------------------------------------------------- reactions */

  function openReactionSheet(profileId, targetType, targetIndex, preview) {
    const emojis = (state && state.emoji_choices) || ['🔥', '👀', '❤️', '😬'];
    let chosen = null;

    const sheet = WM.openSheet(`
      <h3 class="sheet__title">${WM.esc(preview.title)}</h3>
      <div class="sheet__preview">
        ${preview.image ? `<img src="${preview.image}" alt="">` : ''}
        <div class="sheet__preview-text">${WM.esc(preview.body || '')}</div>
      </div>
      <div class="emoji-row">
        ${emojis
          .map((emoji) => `<button class="emoji-btn" data-emoji="${WM.esc(emoji)}">${WM.esc(emoji)}</button>`)
          .join('')}
      </div>
      <textarea class="comment-field" id="reaction-text" style="margin-top: var(--s-4)"
                placeholder="Add a comment (optional)" maxlength="180"></textarea>
      <div class="row" style="margin-top: var(--s-4)">
        <button class="btn btn--ghost" id="reaction-cancel">Cancel</button>
        <button class="btn btn--primary grow" id="reaction-send">Send reaction</button>
      </div>
      <p class="note center" style="margin-top: var(--s-3)">
        Only ${WM.esc(state ? state.owner.name : 'they')} sees this.
      </p>
    `);

    sheet.querySelectorAll('.emoji-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.emoji;
        chosen = chosen === value ? null : value;
        sheet.querySelectorAll('.emoji-btn').forEach((other) => {
          other.classList.toggle('is-selected', other.dataset.emoji === chosen);
        });
      });
    });

    // Typing tells the server to hold the decision window open — this is what
    // stops the owner swiping away mid-thought.
    const field = sheet.querySelector('#reaction-text');
    field.addEventListener('input', () => {
      WM.send('set_typing', { active: true });
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => WM.send('set_typing', { active: false }), 2500);
    });

    const close = () => {
      clearTimeout(typingTimer);
      WM.send('set_typing', { active: false });
      WM.closeSheet();
    };

    sheet.querySelector('#reaction-cancel').addEventListener('click', close);
    sheet.querySelector('#reaction-send').addEventListener('click', () => {
      const text = field.value.trim();
      if (!chosen && !text) {
        WM.toast('Pick an emoji or write a comment.');
        return;
      }
      WM.send('react', {
        profile_id: profileId,
        target_type: targetType,
        target_index: targetIndex,
        emoji: chosen,
        text
      });
      close();
      WM.toast('Sent 🪽', { wing: true, duration: 1600 });
    });
  }

  function blockPreview(profile, targetType, targetIndex) {
    if (targetType === 'photo') {
      const photo = profile.photos[targetIndex];
      return {
        title: `React to this photo`,
        image: WM.photoSrc(profile.id, photo, targetIndex),
        body: photo.caption || ''
      };
    }
    const prompt = profile.prompts[targetIndex];
    return {
      title: 'React to this prompt',
      image: null,
      body: `${prompt.question} — ${prompt.answer}`
    };
  }

  /* --------------------------------------------------- swiping together */

  function renderSwipe() {
    const profile = state.current_profile;
    $('swipe-heading').textContent = `Swiping with ${state.owner.name}`;
    $('swipe-avatars').innerHTML = (state.friends || []).map((f) => WM.avatar(f)).join('');

    const host = $('friend-profile');

    if (!profile) {
      host.innerHTML = `
        <div class="hold">
          <div class="pulse">🪽</div>
          <h2 class="hold__title">That's the last one</h2>
          <p class="note">Hang tight while ${WM.esc(state.owner.name)} wraps up.</p>
        </div>`;
      $('window-status').classList.add('hidden');
      return;
    }

    $('window-status').classList.remove('hidden');
    const remaining = Math.ceil((state.lock_remaining_ms || 0) / 1000);
    $('window-status').textContent = remaining
      ? `🪽 ${remaining}s to react — ${state.owner.name} can't swipe yet`
      : `🪽 ${state.owner.name} can swipe now`;

    const signature = `${profile.id}:${(state.reactions.current || []).length}`;
    if (host.dataset.signature === signature) return;
    host.dataset.signature = signature;

    ProfileView.render(host, profile, {
      reactions: state.reactions.current,
      reactable: true,
      onBlock: (targetType, targetIndex) =>
        openReactionSheet(profile.id, targetType, targetIndex, blockPreview(profile, targetType, targetIndex))
    });
  }

  /* -------------------------------------------------------- profile review */

  document.querySelectorAll('#review-tabs button').forEach((button) => {
    button.addEventListener('click', () => {
      reviewTab = button.dataset.tab;
      document.querySelectorAll('#review-tabs button').forEach((other) =>
        other.classList.toggle('is-active', other === button)
      );
      $('review-body').dataset.signature = '';
      renderReview();
    });
  });

  function renderReview() {
    const profile = state.owner_profile;
    $('review-heading').textContent = `Reviewing ${profile.name}'s profile`;
    $('review-avatars').innerHTML = (state.friends || []).map((f) => WM.avatar(f)).join('');

    const host = $('review-body');
    const reactions = (state.reactions && state.reactions.owner_profile) || [];
    const signature = `${reviewTab}:${reactions.length}:${(state.suggestions || []).length}`;
    if (host.dataset.signature === signature) return;
    host.dataset.signature = signature;

    if (reviewTab === 'photos') renderReviewPhotos(host, profile, reactions);
    else if (reviewTab === 'order') renderReorder(host, profile);
    else renderPromptReview(host, profile, reactions);
  }

  function renderReviewPhotos(host, profile, reactions) {
    host.innerHTML = `<p class="note">Tap any photo or prompt to react. ${WM.esc(
      profile.name
    )} decides what actually changes.</p><div id="review-profile-host"></div>`;

    ProfileView.render($('review-profile-host'), profile, {
      reactions,
      reactable: true,
      onBlock: (targetType, targetIndex) =>
        openReactionSheet(profile.id, targetType, targetIndex, blockPreview(profile, targetType, targetIndex))
    });
  }

  /* Drag-and-drop reorder. Pointer events rather than HTML5 drag-and-drop
     because this has to work with a thumb on a phone, which native DnD does
     not support. */
  function renderReorder(host, profile) {
    if (!draftOrder || draftOrder.length !== profile.photos.length) {
      draftOrder = profile.photos.map((_, index) => index);
    }

    const mine = (state.suggestions || []).find(
      (s) => s.kind === 'photo_order' && s.friend_id === state.you.id
    );

    host.innerHTML = `
      <p class="note">Drag ${WM.esc(profile.name)}'s photos into the order you'd put them in.
      Your suggestion goes to them as a one-tap accept — they never have to drag anything.</p>
      <div class="reorder-grid" id="reorder-grid"></div>
      <button class="btn btn--primary btn--block" id="submit-order">
        ${mine ? 'Update my suggested order' : 'Suggest this order'}
      </button>
      ${mine ? `<div class="submitted">🪽 Sent to ${WM.esc(profile.name)} — waiting on their approval.</div>` : ''}
    `;

    paintTiles(profile);
    $('submit-order').addEventListener('click', () => {
      WM.send('suggest_photo_order', { order: draftOrder });
      WM.toast('Order suggestion sent 🪽', { wing: true });
    });
  }

  function paintTiles(profile) {
    const grid = $('reorder-grid');
    if (!grid) return;
    grid.innerHTML = draftOrder
      .map((originalIndex, position) => {
        const photo = profile.photos[originalIndex];
        const slot = photo.slot != null ? photo.slot : originalIndex;
        return `
          <div class="reorder-tile" data-position="${position}">
            <img src="${WM.photoSrc(profile.id, photo, originalIndex)}" alt="">
            <span class="reorder-tile__index">${position + 1}</span>
            <span class="reorder-tile__handle">⠿</span>
          </div>`;
      })
      .join('');

    grid.querySelectorAll('.reorder-tile').forEach((tile) => attachDrag(tile, profile));
  }

  function attachDrag(tile, profile) {
    let origin = null;

    tile.addEventListener('pointerdown', (event) => {
      origin = { x: event.clientX, y: event.clientY };
      tile.setPointerCapture(event.pointerId);
      tile.classList.add('is-dragging');
    });

    tile.addEventListener('pointermove', (event) => {
      if (!origin) return;
      tile.style.transform = `translate(${event.clientX - origin.x}px, ${event.clientY - origin.y}px)`;
      tile.style.zIndex = 5;

      const over = tileUnder(event.clientX, event.clientY, tile);
      document
        .querySelectorAll('.reorder-tile')
        .forEach((other) => other.classList.toggle('is-over', other === over));
    });

    const finish = (event) => {
      if (!origin) return;
      const over = tileUnder(event.clientX, event.clientY, tile);
      tile.style.transform = '';
      tile.style.zIndex = '';
      tile.classList.remove('is-dragging');
      document.querySelectorAll('.reorder-tile').forEach((other) => other.classList.remove('is-over'));
      origin = null;

      if (over && over !== tile) {
        const from = Number(tile.dataset.position);
        const to = Number(over.dataset.position);
        const [moved] = draftOrder.splice(from, 1);
        draftOrder.splice(to, 0, moved);
        paintTiles(profile);
      }
    };

    tile.addEventListener('pointerup', finish);
    tile.addEventListener('pointercancel', finish);
  }

  function tileUnder(x, y, ignore) {
    ignore.style.pointerEvents = 'none';
    const element = document.elementFromPoint(x, y);
    ignore.style.pointerEvents = '';
    return element ? element.closest('.reorder-tile') : null;
  }

  function renderPromptReview(host, profile, reactions) {
    const mine = (state.suggestions || []).filter(
      (s) => s.kind === 'prompt_edit' && s.friend_id === state.you.id
    );

    host.innerHTML =
      `<p class="note">Flag a prompt that could be stronger, and write what you'd say instead.</p>` +
      profile.prompts
        .map((prompt, index) => {
          const sent = mine.filter((s) => s.prompt_index === index);
          const others = (state.suggestions || []).filter(
            (s) => s.kind === 'prompt_edit' && s.prompt_index === index && s.friend_id !== state.you.id
          );
          return `
            <div class="prompt-review" data-prompt="${index}">
              <div class="prompt__q">${WM.esc(prompt.question)}</div>
              <div class="prompt__a">${WM.esc(prompt.answer)}</div>
              <div class="prompt-review__actions">
                <button class="chip-toggle" data-flag="${index}">⚑ Could be stronger</button>
                <button class="chip-toggle" data-suggest="${index}">✎ Suggest an answer</button>
              </div>
              ${sent
                .map(
                  (s) => `<div class="submitted">You suggested: “${WM.esc(s.suggested_answer)}”</div>`
                )
                .join('')}
              ${others
                .map(
                  (s) =>
                    `<div class="reaction-note" style="border-left-color:${WM.esc(s.accent)}">
                       <strong>${WM.esc(s.friend_name)}</strong> suggested: ${WM.esc(s.suggested_answer)}
                     </div>`
                )
                .join('')}
            </div>`;
        })
        .join('');

    host.querySelectorAll('[data-flag]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.flag);
        button.classList.add('is-on');
        WM.send('suggest_prompt', {
          prompt_index: index,
          suggested_answer: '',
          flagged: true
        });
        WM.toast('Flagged for review 🪽', { wing: true, duration: 1800 });
      });
    });

    host.querySelectorAll('[data-suggest]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.suggest);
        openPromptSheet(profile, index);
      });
    });
  }

  function openPromptSheet(profile, index) {
    const prompt = profile.prompts[index];
    const sheet = WM.openSheet(`
      <h3 class="sheet__title">Suggest an answer</h3>
      <div class="sheet__preview">
        <div class="sheet__preview-text">
          <strong>${WM.esc(prompt.question)}</strong><br>${WM.esc(prompt.answer)}
        </div>
      </div>
      <textarea class="comment-field" id="prompt-text" style="min-height:120px" maxlength="280"
        placeholder="What would you write instead?"></textarea>
      <div class="row" style="margin-top: var(--s-4)">
        <button class="btn btn--ghost" id="prompt-cancel">Cancel</button>
        <button class="btn btn--primary grow" id="prompt-send">Send suggestion</button>
      </div>
      <p class="note center" style="margin-top: var(--s-3)">
        ${WM.esc(profile.name)} approves every change before anything goes live.
      </p>
    `);

    sheet.querySelector('#prompt-cancel').addEventListener('click', WM.closeSheet);
    sheet.querySelector('#prompt-send').addEventListener('click', () => {
      const value = sheet.querySelector('#prompt-text').value.trim();
      if (!value) {
        WM.toast('Write a suggested answer first.');
        return;
      }
      WM.send('suggest_prompt', { prompt_index: index, suggested_answer: value, flagged: true });
      WM.closeSheet();
      WM.toast('Suggestion sent 🪽', { wing: true });
    });
  }

  /* --------------------------------------------------------------- joined */

  function renderJoined() {
    $('joined-title').textContent = "You're in";
    $('joined-body').textContent = `Hang tight — ${state.owner.name} will start the session in a moment.`;
    $('joined-roster').innerHTML = (state.friends || [])
      .map(
        (friend) => `
        <div class="roster__slot">
          ${WM.avatar(friend)}
          <div class="grow">${WM.esc(friend.name)}${friend.id === state.you.id ? ' (you)' : ''}</div>
        </div>`
      )
      .join('');
  }

  function renderEnded() {
    $('ended-body').textContent = `${state.owner.name} will review your suggestions soon.`;
  }

  /* ------------------------------------------------------------- routing */

  function route() {
    if (!state) return;
    if (state.status === 'waiting') {
      WM.showScreen('joined');
      renderJoined();
      return;
    }
    if (state.status === 'ended') {
      WM.showScreen('ended');
      renderEnded();
      return;
    }
    if (state.mode === 'review') {
      WM.showScreen('review');
      renderReview();
    } else {
      WM.showScreen('swipe');
      renderSwipe();
    }
  }

  /* ---------------------------------------------------------- socket in */

  WM.on('state', ({ state: next }) => {
    state = next;
    const profileId = state.current_profile ? state.current_profile.id : null;
    if (profileId !== lastProfileId) {
      lastProfileId = profileId;
      draftOrder = null;
      const host = $('friend-profile');
      if (host) host.dataset.signature = '';
    }
    route();
  });

  WM.on('session_started', () => {
    WM.toast('Session started 🪽', { wing: true, duration: 1800 });
  });

  /* The owner's decision closes the friend's card at the same moment — the
     signal that the window is over and a new profile is coming. */
  WM.on('profile_changed', () => {
    const host = $('friend-profile');
    if (!host) return;
    host.classList.add('closing');
    setTimeout(() => {
      host.classList.remove('closing');
      host.dataset.signature = '';
      if (state) renderSwipe();
    }, 400);
  });

  // Likes are announced; passes stay silent, because silence is what a pass
  // feels like in person. The owner can switch this off entirely.
  WM.on('owner_decision', ({ action, owner_name }) => {
    if (action === 'like') {
      WM.toast(`${WM.esc(owner_name)} liked him! 🎉`, { wing: true });
    }
  });

  WM.on('reaction_added', ({ reaction }) => {
    if (state && state.you && reaction.friend_id === state.you.id) return;
    WM.toast(`${WM.esc(reaction.friend_name)} reacted ${WM.esc(reaction.emoji || '')}`, {
      duration: 1800
    });
  });

  WM.on('session_ended', ({ owner_name }) => {
    WM.toast(`You're a great wing 🪽 ${WM.esc(owner_name)} will review your suggestions soon.`, {
      wing: true,
      duration: 4200
    });
  });

  /* Closure: the friend hears about it when their input actually lands. */
  WM.on('recap_actioned', ({ owner_name, friend_id }) => {
    const mine = state && state.you && friend_id === state.you.id;
    const message = mine
      ? `${WM.esc(owner_name)} loved your suggestion and updated their profile! 🪽`
      : `${WM.esc(owner_name)} accepted a suggestion 🪽`;
    WM.toast(message, { wing: true, duration: 4200 });

    const host = $('ended-updates');
    if (host && mine) {
      host.innerHTML = `<div class="submitted">🪽 ${WM.esc(owner_name)} used your suggestion.</div>`;
    }
  });

  WM.on('participant_joined', ({ participant }) => {
    if (state && state.you && participant.id === state.you.id) return;
    WM.toast(`${WM.esc(participant.name)} joined too 🪽`, { duration: 2200 });
  });

  WM.on('error', ({ message }) => WM.toast(WM.esc(message)));

  /* ---------------------------------------------------------------- boot */

  const remembered = localStorage.getItem('wingmode:account');
  account = ACCOUNTS.find((a) => a.id === remembered) || null;
  participantId = code ? sessionStorage.getItem(storageKey()) : null;

  if (participantId) {
    // Returning after a reload — straight back into the session, same seat.
    WM.connect(code, participantId);
  } else if (account) {
    afterLogin();
  } else {
    renderLogin();
    WM.showScreen('login');
  }
})();
