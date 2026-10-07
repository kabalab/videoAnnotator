import { config } from '../../config.js';
import { h } from '../../core/dom.js';
import { state } from '../../core/store.js';
import { icon } from '../../ui/icons.js';

// Load-time issues come from validate.js; reference issues are computed live because tags and markers change.
export function collectIssues() {
  const list = [...state.issues];
  const tagIds = new Set(state.descriptors.tags.map((t) => t.id));
  const markerIds = new Set(state.descriptors.markers.map((m) => m.id));
  for (const v of state.videos.values()) {
    const tags = new Set();
    const markers = new Set();
    for (const n of v.notes) {
      n.tags.forEach((t) => !tagIds.has(t) && tags.add(t));
      n.markers.forEach((m) => !markerIds.has(m) && markers.add(m));
    }
    const path = config.paths.videoData(v.id);
    if (tags.size) {
      list.push({ path, level: 'warning', message: `Notes use unknown tag${tags.size > 1 ? 's' : ''} ${[...tags].map((t) => `"${t}"`).join(', ')}. They show as gray chips; recreate the tag or remove it from those notes.` });
    }
    if (markers.size) {
      list.push({ path, level: 'warning', message: `Notes use unknown marker${markers.size > 1 ? 's' : ''} ${[...markers].map((m) => `"${m}"`).join(', ')}. Recreate the marker or remove it from those notes.` });
    }
  }
  return list;
}

export function renderIssues() {
  const list = collectIssues();
  if (!list.length) return h('p', { class: 'muted' }, 'No problems found in the data files.');
  const byPath = new Map();
  for (const i of list) {
    if (!byPath.has(i.path)) byPath.set(i.path, []);
    byPath.get(i.path).push(i);
  }
  return h(
    'div',
    { class: 'issues' },
    [...byPath].map(([path, items]) =>
      h(
        'div',
        { class: 'issue-group' },
        h('code', { class: 'issue-path' }, path),
        h(
          'ul',
          { class: 'issue-list' },
          items.map((i) => h('li', { class: `issue issue-${i.level}` }, icon(i.level === 'error' ? 'warning' : 'info'), h('span', {}, i.message))),
        ),
      ),
    ),
  );
}
