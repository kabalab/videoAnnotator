import { randomId } from '../core/ids.js';

export const SCHEMA_VERSION = 1;
export const VISIBILITY = ['public', 'private'];
export const NOTE_TYPES = ['timestamp', 'generic'];

const VIDEO_KEYS = ['schemaVersion', 'id', 'title', 'description', 'visibility', 'sources', 'duration', 'createdAt', 'updatedAt'];
const SOURCE_KEYS = ['local', 'youtube', 'offsetSeconds', 'noFile'];
const NOTE_KEYS = ['id', 'type', 'timestamp', 'title', 'content', 'tags', 'markers', 'visibility', 'createdAt', 'updatedAt'];
const TAG_KEYS = ['id', 'name', 'color', 'description'];
const MARKER_KEYS = ['id', 'name', 'description', 'date', 'order'];

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function newNote(partial = {}) {
  const t = nowIso();
  return {
    id: randomId('n'),
    type: 'generic',
    timestamp: null,
    title: '',
    content: '',
    tags: [],
    markers: [],
    visibility: 'public',
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

export function newVideo(partial = {}) {
  const t = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: '',
    title: '',
    description: '',
    visibility: 'public',
    sources: { local: '', youtube: '', offsetSeconds: 0 },
    createdAt: t,
    updatedAt: t,
    notes: [],
    ...partial,
  };
}

// Known keys first in a fixed order (clean git diffs), unknown keys preserved after them,
// internal "__" keys dropped.
function ordered(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  for (const k of Object.keys(obj)) {
    if (!(k in out) && !k.startsWith('__') && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

export function serializeNote(note) {
  let n = note;
  // A note whose timestamp couldn't be parsed is shown as generic, but its original value is written back.
  if ('__originalTimestamp' in note) {
    n = { ...note, type: note.__originalType, timestamp: note.__originalTimestamp };
  }
  return ordered(n, NOTE_KEYS);
}

export function serializeVideo(video) {
  const { notes, sources, ...rest } = video;
  const out = ordered(rest, VIDEO_KEYS);
  const src = { ...(sources || {}) };
  if (!src.noFile) delete src.noFile;
  out.sources = ordered(src, SOURCE_KEYS);
  if (out.duration === undefined) delete out.duration;
  out.notes = [...(notes || []).map(serializeNote), ...(video.__quarantine || [])];
  // Keep "sources" right after "visibility" even when unknown keys exist.
  return ordered(out, [...VIDEO_KEYS, 'notes']);
}

export function serializeDescriptors(d) {
  const { tags, markers, ...rest } = d;
  return ordered(
    {
      ...rest,
      schemaVersion: SCHEMA_VERSION,
      tags: [...tags.map((t) => ordered(t, TAG_KEYS)), ...(d.__quarantine?.tags || [])],
      markers: [...markers.map((m) => ordered(m, MARKER_KEYS)), ...(d.__quarantine?.markers || [])],
    },
    ['schemaVersion', 'tags', 'markers'],
  );
}

export function serializeLibrary(ids, extra = {}, quarantine = []) {
  return ordered({ ...extra, schemaVersion: SCHEMA_VERSION, videos: [...ids, ...quarantine] }, ['schemaVersion', 'videos']);
}

export function toJsonText(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}
