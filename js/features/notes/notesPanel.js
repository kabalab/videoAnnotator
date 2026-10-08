import { fill, h } from '../../core/dom.js';
import { canEdit } from '../../core/store.js';
import { icon } from '../../ui/icons.js';
import { tagChip, markerChip } from '../descriptors/chips.js';
import { renderNoteItem } from './noteItem.js';

export function createNotesPanel({ onJump, onOpen, onAdd, compact = false, onClose }) {
  let video = null;
  let tab = null;
  const filter = { tags: new Set(), markers: new Set() };
  let currentId = null;
  let lastTime = 0;

  const prefix = compact ? 'quick-' : 'page-';
  const list = h('ol', { class: 'notes-list' });
  const panelBody = h('div', { class: 'notes-tabpanel' }, list);
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
    list.replaceChildren(...shown.map((n) => renderNoteItem(n, { onJump, onOpen, editable, compact })));
    panelBody.id = `${prefix}panel`;
    panelBody.setAttribute('role', 'tabpanel');
    panelBody.setAttribute('aria-labelledby', `${prefix}tab-${tab}`);

    let empty = null;
    if (!shown.length) {
      let text;
      if (source.length) text = 'No notes match the selected tags or markers.';
      else if (tab === 'timeline') text = editable ? 'No timestamp notes yet. Press N or choose Timestamp to note the current moment.' : 'No timestamp notes.';
      else text = editable ? 'No general notes yet. Use them for summaries, context or thoughts about the whole video.' : 'No general notes.';
      empty = h('p', { class: 'notes-empty' }, text);
    }
    panelBody.replaceChildren(...[empty, list].filter(Boolean));

    fill(el, header, filterRow, panelBody);
    currentId = null;
    setCurrentTime(lastTime);
  }

  function setCurrentTime(t) {
    lastTime = t;
    if (!video || tab !== 'timeline') return;
    let id = null;
    for (const n of sortedTimestamps()) {
      if (n.timestamp <= t + 0.25) id = n.id;
      else break;
    }
    if (id === currentId) return;
    list.querySelector('.note.is-current')?.classList.remove('is-current');
    currentId = id;
    if (!id) return;
    const li = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!li) return;
    li.classList.add('is-current');
    if (!el.matches(':hover') && list.scrollHeight > list.clientHeight) scrollListTo(li, 'smooth');
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
    highlight,
  };
}
