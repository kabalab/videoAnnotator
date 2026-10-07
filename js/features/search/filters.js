import { listVideos, sortedTags, sortedMarkers, showPrivate } from '../../core/store.js';

// Filter registry. Adding a filter means adding one entry here; the search view, URL state and
// marker view pick it up automatically. Filters combine with AND; values within one filter with OR.
export const FILTERS = [
  {
    id: 'video',
    label: 'Video',
    options: () => listVideos().map((v) => ({ value: v.id, label: v.title })),
    test: (doc, vals) => vals.includes(doc.videoId),
  },
  {
    id: 'type',
    label: 'Type',
    options: () => [
      { value: 'timestamp', label: 'Timestamp notes' },
      { value: 'generic', label: 'General notes' },
      { value: 'video', label: 'Video titles & descriptions' },
    ],
    test: (doc, vals) => vals.includes(doc.type),
  },
  {
    id: 'tag',
    label: 'Tag',
    options: () => sortedTags().map((t) => ({ value: t.id, label: t.name, color: t.color })),
    test: (doc, vals) => doc.tagIds.some((t) => vals.includes(t)),
  },
  {
    id: 'marker',
    label: 'Marker',
    options: () => sortedMarkers().map((m) => ({ value: m.id, label: m.name, marker: true })),
    test: (doc, vals) => doc.markerIds.some((m) => vals.includes(m)),
  },
  {
    id: 'visibility',
    label: 'Visibility',
    available: () => showPrivate(),
    options: () => [
      { value: 'public', label: 'Public' },
      { value: 'private', label: 'Private' },
    ],
    test: (doc, vals) => vals.includes(doc.visibility),
  },
];

export function availableFilters() {
  return FILTERS.filter((f) => !f.available || f.available());
}

export function filtersFromQuery(query) {
  const out = {};
  for (const f of availableFilters()) {
    const raw = query[f.id];
    if (raw) out[f.id] = String(raw).split(',').filter(Boolean);
  }
  return out;
}

export function hasActiveFilters(filters) {
  return Object.values(filters).some((v) => v?.length);
}

export function passesFilters(doc, filters) {
  for (const f of FILTERS) {
    const vals = filters[f.id];
    if (vals?.length && !f.test(doc, vals)) return false;
  }
  return true;
}
