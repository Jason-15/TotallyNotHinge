/* Shared profile renderer.

   One function draws a Hinge profile everywhere it appears: the Discover deck,
   the friend's reaction view, and the owner's own profile in Edit Profile and
   Profile Review. Reactions are attached to individual photos and prompts, so
   every block carries data-target-type / data-target-index — that pairing is
   what lets the Wing Badge scroll to the exact element a friend reacted to. */

const ProfileView = (() => {

  /* Hinge alternates photos and prompts rather than grouping them. This walks
     both lists together so a profile reads as a feed, not two stacks. */
  function interleave(profile) {
    const blocks = [];
    const photos = profile.photos || [];
    const prompts = profile.prompts || [];
    let photoIndex = 0;
    let promptIndex = 0;
    // Two photos, then a prompt — roughly Hinge's own rhythm.
    while (photoIndex < photos.length || promptIndex < prompts.length) {
      for (let n = 0; n < 2 && photoIndex < photos.length; n++) {
        blocks.push({ type: 'photo', index: photoIndex, data: photos[photoIndex] });
        photoIndex++;
      }
      if (promptIndex < prompts.length) {
        blocks.push({ type: 'prompt', index: promptIndex, data: prompts[promptIndex] });
        promptIndex++;
      }
    }
    return blocks;
  }

  function groupReactions(reactions) {
    const grouped = {};
    (reactions || []).forEach((reaction) => {
      const key = `${reaction.target_type}:${reaction.target_index}`;
      (grouped[key] || (grouped[key] = [])).push(reaction);
    });
    return grouped;
  }

  /* Stacked initials, Google Docs style. Capped at 3 because the session is.
     This overlays the element, so it's safe inside a photo. */
  function stackMarkup(reactions) {
    if (!reactions || !reactions.length) return '';
    const chips = reactions
      .filter((reaction) => reaction.emoji)
      .slice(0, 3)
      .map(
        (reaction) => `
        <span class="reaction-chip">
          ${WM.avatar(reaction)}
          <span>${WM.esc(reaction.emoji)}</span>
        </span>`
      )
      .join('');
    return chips ? `<div class="reaction-stack">${chips}</div>` : '';
  }

  /* Comments in the margin of a photo, Google Docs style.
     They're positioned over the right edge rather than added below, so a
     comment arriving mid-session doesn't reflow the feed and shove the next
     photo down under the reader. Nothing moves; a card just appears. */
  function marginNotesMarkup(reactions, { showNotes = true, maxVisible = 2 } = {}) {
    if (!showNotes || !reactions) return '';
    const withText = reactions.filter((reaction) => reaction.text);
    if (!withText.length) return '';

    const cards = withText
      .slice(0, maxVisible)
      .map(
        (reaction) => `
        <div class="photo-note" style="border-left-color:${WM.esc(reaction.accent)}">
          <div class="photo-note__who">
            ${WM.avatar(reaction)}
            <span>${WM.esc(reaction.friend_name)}</span>
            ${reaction.emoji ? `<span>${WM.esc(reaction.emoji)}</span>` : ''}
          </div>
          <div class="photo-note__text">${WM.esc(reaction.text)}</div>
        </div>`
      )
      .join('');

    const overflow = withText.length - maxVisible;
    const more = overflow > 0 ? `<div class="photo-note photo-note--more">+${overflow} more</div>` : '';
    return `<div class="photo-notes">${cards}${more}</div>`;
  }

  /* Comments under a prompt. A prompt card has no fixed height, so these can
     sit in normal flow where they read more like a threaded reply. */
  function inlineNotesMarkup(reactions, { showNotes = true } = {}) {
    if (!showNotes || !reactions || !reactions.length) return '';
    return reactions
      .filter((reaction) => reaction.text)
      .map(
        (reaction) => `
        <div class="reaction-note" style="border-left-color:${WM.esc(reaction.accent)}">
          <strong>${WM.esc(reaction.friend_name)}</strong>
          ${reaction.emoji ? ' ' + WM.esc(reaction.emoji) : ''} · ${WM.esc(reaction.text)}
        </div>`
      )
      .join('');
  }

  function blockMarkup(block, profile, grouped, options) {
    const key = `${block.type}:${block.index}`;
    const reactions = grouped[key];
    const reactable = options.reactable ? ' block--reactable' : '';
    const attrs = `data-target-type="${block.type}" data-target-index="${block.index}" id="block-${key.replace(':', '-')}"`;

    if (block.type === 'photo') {
      // Resolves an uploaded photo's url, or falls back to the seed slot.
      // The caption is a sibling, not an overlay: it has to sit under the photo
      // rather than on it, and the block itself is a fixed-ratio clipped box.
      const hasCaption = !!block.data.caption;
      const caption = hasCaption
        ? `<div class="photo-caption">${WM.esc(block.data.caption)}</div>`
        : '';
      return `
        <div class="block block--photo${hasCaption ? ' is-captioned' : ''}${reactable}" ${attrs}>
          <img src="${WM.photoSrc(profile.id, block.data, block.index)}" alt="${WM.esc(block.data.caption || '')}" loading="lazy">
          ${stackMarkup(reactions)}
          ${marginNotesMarkup(reactions, options)}
        </div>
        ${caption}`;
    }

    return `
      <div class="block block--prompt${reactable}" ${attrs}>
        <div class="prompt__q">${WM.esc(block.data.question)}</div>
        <div class="prompt__a">${WM.esc(block.data.answer)}</div>
        ${stackMarkup(reactions)}
        ${inlineNotesMarkup(reactions, options)}
      </div>`;
  }

  /**
   * @param {HTMLElement} container
   * @param {Object} profile
   * @param {Object} options
   *   reactions   [] reactions scoped to this profile
   *   reactable   bool — render tap-to-react affordance
   *   onBlock     fn(targetType, targetIndex, element)
   *   attributions [] — "Suggested by X" credits, owner's own profile only
   */
  function render(container, profile, options = {}) {
    if (!profile) {
      container.innerHTML = '';
      return;
    }
    const grouped = groupReactions(options.reactions);
    const blocks = interleave(profile);

    const attributionFor = (block) => {
      if (!options.attributions) return '';
      const element = block.type === 'prompt' ? `prompt:${block.index}` : 'photos';
      // Photo-order credit belongs on the first photo only, or it repeats.
      if (element === 'photos' && block.index !== 0) return '';
      const credit = options.attributions.find((a) => a.element === element);
      if (!credit) return '';
      return `<div class="attribution">🪽 Suggested by ${WM.esc(credit.friend_name)}</div>`;
    };

    container.innerHTML = `
      <div class="profile">
        <div class="profile__header">
          <h2 class="profile__name">${WM.esc(profile.name)}</h2>
          <div class="profile__meta">
            <span>${WM.esc(profile.age)}</span>
            <span>${WM.esc(profile.job)}</span>
            <span>${WM.esc(profile.location)}</span>
          </div>
        </div>
        ${blocks
          .map((block) => blockMarkup(block, profile, grouped, options) + attributionFor(block))
          .join('')}
      </div>`;

    if (options.onBlock) {
      container.querySelectorAll('.block').forEach((node) => {
        node.addEventListener('click', () =>
          options.onBlock(node.dataset.targetType, Number(node.dataset.targetIndex), node)
        );
      });
    }
  }

  /* Used by the Wing Badge: bring the reacted element into view and flash it. */
  function spotlight(container, targetType, targetIndex) {
    const node = container.querySelector(
      `.block[data-target-type="${targetType}"][data-target-index="${targetIndex}"]`
    );
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.remove('is-spotlit');
    void node.offsetWidth; // restart the animation if the same block is tapped twice
    node.classList.add('is-spotlit');
  }

  return { render, spotlight, interleave };
})();
