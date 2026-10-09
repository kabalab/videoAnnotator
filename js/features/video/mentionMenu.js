import { formattedText, h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { mentionChoices, mentionClosed, mentionQuery } from './noteRefs.js';
import { videoMentionChoices, videoMentionClosed } from './videoRefs.js';

// Dropdown under a text field while the caret is in an @ note or a # video reference.
// sigils limits which marks open the list. includeNow adds a clock-time row while typing @.
export function attachMentionMenu(textarea, source) {
  const getNotes = typeof source === 'function' ? source : source?.getNotes;
  const getVideos = typeof source === 'function' ? null : source?.getVideos;
  const sigils = typeof source === 'function' ? '@' : source?.sigils || '@#';
  const includeNow = typeof source === 'function' ? null : source?.includeNow;
  const menuId = `mention-${Math.random().toString(36).slice(2, 8)}`;
  const menu = h('ul', { class: 'picker-menu mention-menu', hidden: true, role: 'listbox', 'aria-label': 'Links' });
  let items = [];
  let index = 0;
  let start = null;
  let queryText = null;
  // Choosing a note writes the token and fires input. Skip that one refresh so the menu doesn't reopen on the token just inserted.
  let pause = false;

  function hide() {
    menu.hidden = true;
    menu.replaceChildren();
    items = [];
    start = null;
    queryText = null;
    textarea.removeAttribute('aria-activedescendant');
    textarea.setAttribute('aria-expanded', 'false');
  }

  function choose(i) {
    const item = items[i];
    if (!item || start == null) return;
    const cursor = textarea.selectionStart;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(cursor);
    const gap = after.startsWith(' ') || after.startsWith('\n') || after === '' ? '' : ' ';
    const insert = item.token + gap;
    pause = true;
    textarea.value = before + insert + after;
    const pos = before.length + insert.length;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    pause = false;
    hide();
  }

  function revealActive() {
    const active = menu.querySelector('.is-active');
    if (!active) return;
    const menuRect = menu.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    const pad = 4;
    if (itemRect.top < menuRect.top + pad) menu.scrollTop -= menuRect.top + pad - itemRect.top;
    else if (itemRect.bottom > menuRect.bottom - pad) menu.scrollTop += itemRect.bottom - (menuRect.bottom - pad);
  }

  function choicesFor(found) {
    if (found.sigil === '#') return videoMentionChoices(getVideos?.() || [], found.query);
    const items = mentionChoices(getNotes?.() || [], found.query).map((item) => ({
      token: item.token,
      label: item.label,
      hint: item.time || 'General',
      icon: item.time ? 'clock' : 'note',
    }));
    if (found.sigil === '@' && includeNow) {
      const q = found.query.trim().toLowerCase();
      const token = includeNow();
      const clock = String(token || '').replace(/^@/, '').toLowerCase();
      const wantsNow = q && ('now'.startsWith(q) || (clock && clock.startsWith(q)));
      if (wantsNow && token && !items.some((item) => item.token.toLowerCase() === token.toLowerCase())) {
        items.push({ token, label: 'This time', hint: clock || 'Clock', icon: 'clock' });
      }
    }
    return items;
  }

  function show() {
    if (pause) return;
    if (textarea.selectionStart !== textarea.selectionEnd) return hide();
    const found = mentionQuery(textarea.value, textarea.selectionStart);
    if (!found || !sigils.includes(found.sigil)) return hide();
    const notes = getNotes?.() || [];
    const videos = getVideos?.() || [];
    const closed = found.sigil === '#' ? videoMentionClosed(textarea.value, textarea.selectionStart, videos) : mentionClosed(textarea.value, textarea.selectionStart, notes);
    if (closed) return hide();
    if (found.sigil === '@' && !notes.length && !includeNow) return hide();
    if (found.sigil === '#' && !videos.length) return hide();
    const queryKey = `${found.sigil}${found.query}`;
    if (queryKey !== queryText) {
      queryText = queryKey;
      index = 0;
      menu.scrollTop = 0;
    }
    start = found.start;
    items = choicesFor(found);
    if (!items.length) return hide();
    if (index >= items.length) index = 0;
    const opening = menu.hidden;
    menu.hidden = false;
    menu.setAttribute('aria-label', items.some((item) => item.icon === 'film') ? 'Videos to link' : 'Notes to link');
    textarea.setAttribute('aria-expanded', 'true');
    menu.replaceChildren(
      ...items.map((item, i) => {
        const id = `${menuId}-opt-${i}`;
        if (i === index) textarea.setAttribute('aria-activedescendant', id);
        return h(
          'li',
          {
            id,
            class: ['picker-option', i === index && 'is-active'],
            role: 'option',
            'aria-selected': String(i === index),
            onmousedown: (e) => {
              e.preventDefault();
              choose(i);
            },
          },
          icon(item.icon || 'note'),
          h('span', { class: 'mention-label' }, formattedText(item.label)),
          h('span', { class: 'muted' }, item.hint || ''),
        );
      }),
    );
    revealActive();
    if (opening) requestAnimationFrame(() => menu.scrollIntoView({ block: 'nearest' }));
  }

  textarea.setAttribute('aria-autocomplete', 'list');
  textarea.setAttribute('aria-expanded', 'false');
  textarea.setAttribute('aria-controls', menuId);
  menu.id = menuId;

  textarea.addEventListener('input', show);
  textarea.addEventListener('click', show);
  textarea.addEventListener('keyup', (e) => {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
    show();
  });
  textarea.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      index = (index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      show();
    } else if (e.key === 'Tab' || (e.key === 'Enter' && !e.ctrlKey && !e.metaKey)) {
      e.preventDefault();
      choose(index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hide();
    }
  });
  textarea.addEventListener('blur', () => setTimeout(hide, 120));

  return menu;
}
