import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { mentionChoices, mentionClosed, mentionQuery } from './noteRefs.js';

// Dropdown under the description field while the caret is in an @mention.
export function attachMentionMenu(textarea, getNotes) {
  const menu = h('ul', { class: 'picker-menu mention-menu', hidden: true, role: 'listbox', 'aria-label': 'Notes to link' });
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

  function show() {
    if (pause) return;
    if (textarea.selectionStart !== textarea.selectionEnd) return hide();
    const notes = getNotes() || [];
    const found = mentionQuery(textarea.value, textarea.selectionStart);
    if (!found || !notes.length || mentionClosed(textarea.value, textarea.selectionStart, notes)) return hide();
    if (found.query !== queryText) {
      queryText = found.query;
      index = 0;
      menu.scrollTop = 0;
    }
    start = found.start;
    items = mentionChoices(notes, found.query);
    if (!items.length) return hide();
    if (index >= items.length) index = 0;
    const opening = menu.hidden;
    menu.hidden = false;
    textarea.setAttribute('aria-expanded', 'true');
    menu.replaceChildren(
      ...items.map((item, i) => {
        const id = `mention-opt-${i}`;
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
          icon(item.time ? 'clock' : 'note'),
          h('span', { class: 'mention-label' }, item.label),
          h('span', { class: 'muted' }, item.time || 'General'),
        );
      }),
    );
    revealActive();
    if (opening) requestAnimationFrame(() => menu.scrollIntoView({ block: 'nearest' }));
  }

  textarea.setAttribute('aria-autocomplete', 'list');
  textarea.setAttribute('aria-expanded', 'false');
  textarea.setAttribute('aria-controls', 'mention-list');
  menu.id = 'mention-list';

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
    } else if (e.key === 'Enter' || e.key === 'Tab') {
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
