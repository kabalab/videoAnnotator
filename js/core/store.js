import { Emitter } from './emitter.js';

const bus = new Emitter();

// Events: 'data' ({ videoId? }), 'descriptors', 'mode', 'persistence', 'drafts', 'issues', 'unregistered', 'save'
export const state = {
  env: null,
  uiMode: 'view',
  persistence: { kind: 'loading' },
  descriptors: { tags: [], markers: [] },
  libraryIds: [],
  videos: new Map(),
  videoErrors: new Map(),
  issues: [],
  drafts: [],
  unregistered: [],
  external: { kind: 'none' },
  fatal: null,
};

export const store = {
  state,
  on: (event, fn) => bus.on(event, fn),
  emit: (event, payload) => bus.emit(event, payload),
  set(patch, events = []) {
    Object.assign(state, patch);
    for (const e of [].concat(events)) bus.emit(e);
  },
};

export function canEdit() {
  return !!state.env?.isLocal && state.uiMode === 'edit';
}

export function showPrivate() {
  return !!state.env?.isLocal;
}

export function setUiMode(mode) {
  if (!state.env?.isLocal || (mode !== 'edit' && mode !== 'view')) return;
  state.uiMode = mode;
  try {
    localStorage.setItem('va.uiMode', mode);
  } catch {
    // Storage can be unavailable; the mode just won't be remembered.
  }
  bus.emit('mode');
}

export function getVideo(id) {
  return state.videos.get(id) || null;
}

export function listVideos() {
  return state.libraryIds.map((id) => state.videos.get(id)).filter(Boolean);
}

export function getTag(id) {
  return state.descriptors.tags.find((t) => t.id === id) || null;
}

export function getMarker(id) {
  return state.descriptors.markers.find((m) => m.id === id) || null;
}

export function sortedMarkers() {
  return [...state.descriptors.markers].sort((a, b) => a.name.localeCompare(b.name));
}

export function sortedTags() {
  return [...state.descriptors.tags].sort((a, b) => a.name.localeCompare(b.name));
}
