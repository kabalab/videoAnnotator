import { config } from '../config.js';
import { Emitter } from './emitter.js';

const bus = new Emitter();
const SESSION_KEY = 'va.editorSession';

// Events: 'data' ({ videoId? }), 'descriptors', 'mode', 'persistence', 'drafts', 'issues', 'unregistered', 'save'
export const state = {
  env: null,
  editorSession: false,
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

// True on a local host, and on the public site after the editor code is accepted.
// Folder access stays tied to state.env.isLocal.
export function editorActive() {
  return !!state.env?.isLocal || !!state.editorSession;
}

export function storedEditorSessionMatches() {
  if (!config.editorCode) return false;
  try {
    return localStorage.getItem(SESSION_KEY) === config.editorCode;
  } catch {
    return false;
  }
}

export function editorCodeMatches(code) {
  const expected = config.editorCode;
  if (!expected) return false;
  return String(code ?? '').trim() === expected;
}

function rememberedUiMode() {
  try {
    return localStorage.getItem('va.uiMode') === 'view' ? 'view' : 'edit';
  } catch {
    return 'edit';
  }
}

export function grantEditorSession() {
  if (!config.editorCode) return false;
  state.editorSession = true;
  state.uiMode = rememberedUiMode();
  try {
    localStorage.setItem(SESSION_KEY, config.editorCode);
  } catch {
    // The session still works until the page is reloaded.
  }
  bus.emit('mode');
  return true;
}

export function revokeEditorSession() {
  state.editorSession = false;
  state.uiMode = 'view';
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Signing out still applies until the page is reloaded.
  }
  bus.emit('mode');
}

export function canEdit() {
  return editorActive() && state.uiMode === 'edit';
}

export function showPrivate() {
  return editorActive();
}

export function setUiMode(mode) {
  if (!editorActive() || (mode !== 'edit' && mode !== 'view')) return;
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
