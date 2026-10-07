import { h } from '../../core/dom.js';
import { getTag, getMarker, showPrivate } from '../../core/store.js';
import { icon } from '../../ui/icons.js';

function removeButton(onRemove, label) {
  return h(
    'button',
    {
      class: 'chip-remove',
      type: 'button',
      'aria-label': `Remove ${label}`,
      onclick: (e) => {
        e.stopPropagation();
        onRemove();
      },
    },
    icon('x'),
  );
}

// Unknown references show as gray chips locally (so they can be fixed) and are hidden publicly.
export function tagChip(id, { onRemove, onClick, active, count } = {}) {
  const tag = getTag(id);
  if (!tag && !showPrivate()) return null;
  const name = tag ? tag.name : `unknown: ${id}`;
  const interactive = onClick && !onRemove;
  return h(
    interactive ? 'button' : 'span',
    {
      class: ['chip', 'chip-tag', !tag && 'chip-unknown', active && 'is-active'],
      style: { '--chip': tag?.color || '#6b7383' },
      type: interactive ? 'button' : null,
      'aria-pressed': interactive && active !== undefined ? String(!!active) : null,
      title: tag ? tag.description || `Tag: ${tag.name}` : `Tag "${id}" isn't defined in descriptors.json`,
      onclick: interactive ? onClick : null,
    },
    h('span', { class: 'chip-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'chip-label' }, name),
    count != null && h('span', { class: 'chip-count' }, count),
    onRemove && removeButton(onRemove, name),
  );
}

export function markerChip(id, { onRemove, onClick, active, count, href } = {}) {
  const marker = getMarker(id);
  if (!marker && !showPrivate()) return null;
  const name = marker ? marker.name : `unknown: ${id}`;
  const interactive = (onClick || href) && !onRemove;
  return h(
    href && !onRemove ? 'a' : interactive ? 'button' : 'span',
    {
      class: ['chip', 'chip-marker', !marker && 'chip-unknown', active && 'is-active'],
      href: href && !onRemove ? href : null,
      type: interactive && !href ? 'button' : null,
      'aria-pressed': interactive && !href && active !== undefined ? String(!!active) : null,
      title: marker ? marker.description || `Marker: ${marker.name}${marker.date ? ` (${marker.date})` : ''}` : `Marker "${id}" isn't defined in descriptors.json`,
      onclick: interactive && !href ? onClick : null,
    },
    icon('flag', 'chip-icon'),
    h('span', { class: 'chip-label' }, name),
    count != null && h('span', { class: 'chip-count' }, count),
    onRemove && removeButton(onRemove, name),
  );
}

export function noteChips(note) {
  const chips = [...note.tags.map((t) => tagChip(t)), ...note.markers.map((m) => markerChip(m))].filter(Boolean);
  return chips.length ? h('div', { class: 'chips' }, chips) : null;
}

export function privateBadge(label = 'Local only') {
  return h('span', { class: 'badge badge-private', title: 'Private: hidden on the public site (but still present in the JSON file)' }, icon('lock'), label);
}
