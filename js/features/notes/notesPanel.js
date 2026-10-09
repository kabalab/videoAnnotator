import { fill, h } from '../../core/dom.js';
import { canEdit } from '../../core/store.js';
import { formatTime } from '../../core/time.js';
import { icon } from '../../ui/icons.js';
import { tagChip, markerChip } from '../descriptors/chips.js';
import { renderNoteItem } from './noteItem.js';

export function createNotesPanel({ onJump, onOpen, onAdd, onVideoRef, onNote, compact = false, onClose }) {
  let video = null;
  let tab = null;
  const filter = { tags: new Set(), markers: new Set() };
  let currentId = null;
  let markedNextId = null;
  let nextNote = null;
  let lastTime = 0;

  const prefix = compact ? 'quick-' : 'page-';
  const list = h('ol', { class: 'notes-list' });
  const panelBody = h('div', { class: 'notes-tabpanel' }, list);
  const nextBanner = h('button', { class: 'notes-next', type: 'button', hidden: true });
  nextBanner.addEventListener('click', () => {
    if (nextNote) onJump(nextNote);
  });
  const el = h('section', { class: ['notes-panel', compact && 'notes-panel-compact'], 'aria-label': compact ? 'Quick notes' : 'Notes' });

  const passes = (n) =>
    (!filter.tags.size || n.tags.some((t) => filter.tags.has(t))) && (!filter.markers.size || n.markers.some((m) => filter.markers.has(m)));

  function sortedTimestamps() {
    return video.notes.filter((n) => n.type === 'timestamp').sort((a, b) => a.timestamp - b.timestamp);
  }

  function toggle(set, id) {
    if (set.has(id)) set.delete(id);
    else set.add(id);
    render();
  }

  function render() {
    if (!video) return;
    const editable = canEdit();
    const timestamps = sortedTimestamps();
    const general = video.notes.filter((n) => n.type === 'generic');
    if (tab === null) tab = timestamps.length || !general.length ? 'timeline' : 'general';

    const tabIds = ['timeline', 'general'];
    const tabButton = (id, label, count) =>
      h(
        'button',
        {
          class: ['tab', tab === id && 'is-active'],
          type: 'button',
          role: 'tab',
          id: `${prefix}tab-${id}`,
          'aria-selected': String(tab === id),
          'aria-controls': `${prefix}panel`,
          tabindex: tab === id ? '0' : '-1',
          onclick: () => { tab = id; render(); },
        },
        label,
        h('span', { class: 'tab-count' }, count),
      );

    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Note types' }, tabButton('timeline', 'Timeline', timestamps.length), tabButton('general', 'General', general.length));
    tabs.addEventListener('keydown', (e) => {
      const i = tabIds.indexOf(tab);
      let next = null;
      if (e.key === 'ArrowRight') next = tabIds[(i + 1) % tabIds.length];
      else if (e.key === 'ArrowLeft') next = tabIds[(i - 1 + tabIds.length) % tabIds.length];
      else if (e.key === 'Home') next = tabIds[0];
      else if (e.key === 'End') next = tabIds[tabIds.length - 1];
      else return;
      e.preventDefault();
      e.stopPropagation();
      tab = next;
      render();
      el.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    });

    const header = h(
      'header',
      { class: 'notes-header' },
      tabs,
      h(
        'div',
        { class: 'notes-actions' },
        editable && h('button', { class: 'btn btn-primary btn-sm', type: 'button', title: 'Add a timestamp note at the current time (N)', onclick: () => onAdd('timestamp') }, icon('clock'), h('span', {}, 'Timestamp')),
        editable && h('button', { class: 'btn btn-secondary btn-sm', type: 'button', title: 'Add a general note (G)', onclick: () => onAdd('generic') }, icon('note'), h('span', {}, 'Note')),
        compact && onClose && h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Hide notes', title: 'Hide notes (C)', onclick: onClose }, icon('x')),
      ),
    );

    let filterRow = null;
    if (!compact) {
      const usedTags = [...new Set(video.notes.flatMap((n) => n.tags))];
      const usedMarkers = [...new Set(video.notes.flatMap((n) => n.markers))];
      if (usedTags.length + usedMarkers.length > 1) {
        const active = filter.tags.size + filter.markers.size > 0;
        filterRow = h(
          'div',
          { class: 'notes-filters chips', role: 'group', 'aria-label': 'Filter notes' },
          usedTags.map((id) => tagChip(id, { onClick: () => toggle(filter.tags, id), active: filter.tags.has(id) })),
          usedMarkers.map((id) => markerChip(id, { onClick: () => toggle(filter.markers, id), active: filter.markers.has(id) })),
          active && h('button', { class: 'link-btn', type: 'button', onclick: () => { filter.tags.clear(); filter.markers.clear(); render(); } }, 'Clear'),
        );
      }
    }

    const source = tab === 'timeline' ? timestamps : general;
    const shown = source.filter(passes);
    list.replaceChildren(...shown.map((n) => renderNoteItem(n, { onJump, onOpen, onVideoRef, onNote, notes: video.notes, editable, compact })));
    panelBody.id = `${prefix}panel`;
    panelBody.setAttribute('role', 'tabpanel');
    panelBody.setAttribute('aria-labelledby', `${prefix}tab-${tab}`);

    let empty = null;
    if (!shown.length) {
      let text;
      if (source.length) text = 'No notes match the selected tags or markers.';
      else if (tab === 'timeline') text = editable ? 'No timestamp notes yet. Press N or choose Timestamp to note the current moment. Use them to store info about the specific moment.' : 'No timestamp notes.';
      else text = editable ? 'No general notes yet. Press G or choose note to open a new one. Use them for summaries, context or thoughts about the whole video.' : 'No general notes.';
      empty = h('p', { class: 'notes-empty' }, text);
    }
    panelBody.replaceChildren(...[empty, list].filter(Boolean));

    fill(el, header, filterRow, tab === 'timeline' && nextBanner, panelBody);
    currentId = null;
    markedNextId = null;
    setCurrentTime(lastTime);
  }

  function notePreview(note) {
    const title = note.title?.trim();
    if (title) return title;
    const content = (note.content || '').trim().replace(/\s+/g, ' ');
    if (!content) return 'Timestamp note';
    return content.length > 80 ? `${content.slice(0, 79)}\u2026` : content;
  }

  function timeUntilNext() {
    return formatTime(Math.max(0, nextNote.timestamp - lastTime));
  }

  function paintNext() {
    if (!nextNote || tab !== 'timeline') {
      nextBanner.hidden = true;
      nextBanner.replaceChildren();
      nextBanner.removeAttribute('aria-label');
      return;
    }
    const label = notePreview(nextNote);
    const time = timeUntilNext();
    nextBanner.hidden = false;
    nextBanner.setAttribute('aria-label', `Next note in ${time}: ${label}. Jump there.`);
    nextBanner.replaceChildren(
      h('span', { class: 'notes-next-label' }, 'Next'),
      h('span', { class: 'notes-next-time' }, time),
      h('span', { class: 'notes-next-title' }, label),
    );
  }

  function updateRemain() {
    if (!nextNote || nextBanner.hidden) return;
    const time = timeUntilNext();
    const el = nextBanner.querySelector('.notes-next-time');
    if (!el || el.textContent === time) return;
    el.textContent = time;
    const title = nextBanner.querySelector('.notes-next-title')?.textContent || notePreview(nextNote);
    nextBanner.setAttribute('aria-label', `Next note in ${time}: ${title}. Jump there.`);
  }

  function setCurrentTime(t) {
    lastTime = t;
    if (!video) {
      nextNote = null;
      paintNext();
      return null;
    }
    let id = null;
    let upcoming = null;
    for (const n of sortedTimestamps()) {
      if (n.timestamp <= t + 0.25) id = n.id;
      else {
        upcoming = n;
        break;
      }
    }
    const nextChanged = upcoming?.id !== nextNote?.id;
    nextNote = upcoming;
    if (nextChanged) paintNext();
    else updateRemain();
    if (tab !== 'timeline') return nextNote;
    const upcomingId = upcoming?.id ?? null;
    if (id === currentId && upcomingId === markedNextId) return nextNote;
    list.querySelector('.note.is-current')?.classList.remove('is-current');
    list.querySelector('.note.is-next')?.classList.remove('is-next');
    currentId = id;
    markedNextId = upcomingId;
    if (!nextChanged) paintNext();
    if (id) {
      const li = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (li) {
        li.classList.add('is-current');
        if (!el.matches(':hover') && list.scrollHeight > list.clientHeight) scrollListTo(li, 'smooth');
      }
    }
    if (upcomingId) list.querySelector(`[data-id="${CSS.escape(upcomingId)}"]`)?.classList.add('is-next');
    return nextNote;
  }

  function scrollListTo(li, behavior = 'auto') {
    // .notes-list is position: relative, so offsetTop is measured from the list itself.
    list.scrollTo({ top: li.offsetTop - list.clientHeight / 3, behavior });
  }

  function highlight(noteId) {
    const note = video?.notes.find((n) => n.id === noteId);
    if (!note) return;
    tab = note.type === 'timestamp' ? 'timeline' : 'general';
    if (!passes(note)) {
      filter.tags.clear();
      filter.markers.clear();
    }
    render();
    const li = list.querySelector(`[data-id="${CSS.escape(noteId)}"]`);
    if (!li) return;
    if (list.scrollHeight > list.clientHeight) scrollListTo(li, 'smooth');
    li.classList.remove('is-flash');
    void li.offsetWidth;
    li.classList.add('is-flash');
  }

  return {
    el,
    update(v) {
      video = v;
      render();
    },
    setCurrentTime,
    nextNote: () => nextNote,
    highlight,
  };
}
