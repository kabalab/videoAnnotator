import { config } from '../config.js';
import { ID_PATTERN } from '../core/ids.js';

const V1 = 'VA1.';
const V2 = 'VA2.';
const VIDEO_FILE = /^data\/videos\/([^/]+)\.json$/;

function allowedPath(path) {
  if (path === config.paths.library || path === config.paths.descriptors || path === config.paths.clips) return true;
  if (!path.startsWith('data/videos/') || !path.endsWith('.json')) return false;
  return ID_PATTERN.test(path.slice('data/videos/'.length, -'.json'.length));
}

function bytesToBase64Url(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function parseObject(text) {
  if (text == null) return { missing: true, value: null };
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { bad: true, value: null };
    return { value };
  } catch {
    return { bad: true, value: null };
  }
}

function objects(list) {
  return (Array.isArray(list) ? list : []).filter((item) => item && typeof item === 'object');
}

function byId(list) {
  const map = new Map();
  for (const item of objects(list)) if (item.id) map.set(item.id, item);
  return map;
}

function idsOf(list) {
  return objects(list).map((item) => item.id).filter(Boolean);
}

function fileKind(path) {
  if (path === config.paths.library) return 'library';
  if (path === config.paths.descriptors) return 'descriptors';
  if (path === config.paths.clips) return 'clips';
  if (VIDEO_FILE.test(path)) return 'video';
  return 'other';
}

function changedFields(saved, draft, skip) {
  const fields = {};
  const keys = new Set([...Object.keys(saved || {}), ...Object.keys(draft || {})]);
  for (const key of keys) {
    if (skip.has(key)) continue;
    if (!same(saved?.[key], draft?.[key])) fields[key] = draft?.[key];
  }
  return fields;
}

function videoDelta(saved, draft) {
  const fields = changedFields(saved, draft, new Set(['notes']));
  const before = objects(saved?.notes);
  const after = objects(draft?.notes);
  const beforeMap = byId(before);
  const afterMap = byId(after);
  const notes = [];
  for (const note of after) {
    if (!note.id) continue;
    if (!beforeMap.has(note.id) || !same(beforeMap.get(note.id), note)) notes.push(note);
  }
  const deletedNoteIds = [];
  for (const note of before) if (note.id && !afterMap.has(note.id)) deletedNoteIds.push(note.id);
  const out = {};
  if (Object.keys(fields).length) out.fields = fields;
  if (notes.length) out.notes = notes;
  if (deletedNoteIds.length) out.deletedNoteIds = deletedNoteIds;
  const beforeIds = idsOf(before);
  const afterIds = idsOf(after);
  if (beforeIds.join('\0') !== afterIds.join('\0')) out.noteOrder = afterIds;
  if (!same(before.filter((note) => !note.id), after.filter((note) => !note.id))) out.replaceUnkeyedNotes = after.filter((note) => !note.id);
  return Object.keys(out).length ? out : null;
}

function namedDelta(beforeList, afterList) {
  const before = byId(beforeList);
  const after = byId(afterList);
  const items = [];
  const deletedIds = [];
  for (const item of objects(afterList)) {
    if (!item.id || !before.has(item.id) || !same(before.get(item.id), item)) items.push(item);
  }
  for (const item of objects(beforeList)) if (item.id && !after.has(item.id)) deletedIds.push(item.id);
  const beforeIds = idsOf(beforeList);
  const afterIds = idsOf(afterList);
  return { items, deletedIds, order: beforeIds.join('\0') === afterIds.join('\0') ? null : afterIds };
}

function descriptorDelta(saved, draft) {
  const tags = namedDelta(saved?.tags, draft?.tags);
  const markers = namedDelta(saved?.markers, draft?.markers);
  const fields = changedFields(saved, draft, new Set(['tags', 'markers']));
  const out = {};
  if (tags.items.length) out.tags = tags.items;
  if (tags.deletedIds.length) out.deletedTagIds = tags.deletedIds;
  if (tags.order) out.tagOrder = tags.order;
  if (markers.items.length) out.markers = markers.items;
  if (markers.deletedIds.length) out.deletedMarkerIds = markers.deletedIds;
  if (markers.order) out.markerOrder = markers.order;
  if (Object.keys(fields).length) out.fields = fields;
  return Object.keys(out).length ? out : null;
}

function libraryDelta(saved, draft) {
  const fields = changedFields(saved, draft, new Set(['videos']));
  const out = {};
  if (!same(saved?.videos, draft?.videos)) out.videos = draft?.videos;
  if (Object.keys(fields).length) out.fields = fields;
  return Object.keys(out).length ? out : null;
}

function collectionPatch(before, after) {
  if (!before) return after;
  const patch = { id: after.id };
  let changed = false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === 'id') continue;
    if (key === 'clipIds') {
      if (!same(before.clipIds, after.clipIds)) {
        patch.clipIds = after.clipIds;
        changed = true;
      }
      continue;
    }
    if (!same(before[key], after[key])) {
      patch[key] = after[key];
      changed = true;
    }
  }
  return changed ? patch : null;
}

function clipsDelta(saved, draft) {
  const beforeClips = byId(saved?.clips);
  const afterClips = byId(draft?.clips);
  const clips = [];
  const deletedClipIds = [];
  for (const clip of objects(draft?.clips)) {
    if (!clip.id || !beforeClips.has(clip.id) || !same(beforeClips.get(clip.id), clip)) clips.push(clip);
  }
  for (const clip of objects(saved?.clips)) if (clip.id && !afterClips.has(clip.id)) deletedClipIds.push(clip.id);
  const beforeCollections = byId(saved?.collections);
  const collections = [];
  const deletedCollectionIds = [];
  for (const collection of objects(draft?.collections)) {
    if (!collection.id || !beforeCollections.has(collection.id)) collections.push(collection);
    else {
      const patch = collectionPatch(beforeCollections.get(collection.id), collection);
      if (patch) collections.push(patch);
    }
  }
  for (const collection of objects(saved?.collections)) if (collection.id && !byId(draft?.collections).has(collection.id)) deletedCollectionIds.push(collection.id);
  const fields = changedFields(saved, draft, new Set(['clips', 'collections']));
  const out = {};
  if (clips.length) out.clips = clips;
  if (deletedClipIds.length) out.deletedClipIds = deletedClipIds;
  if (collections.length) out.collections = collections;
  if (deletedCollectionIds.length) out.deletedCollectionIds = deletedCollectionIds;
  if (Object.keys(fields).length) out.fields = fields;
  return Object.keys(out).length ? out : null;
}

function diffText(path, baseText, draftText) {
  const base = parseObject(baseText);
  const draft = parseObject(draftText);
  if (base.missing || base.bad || draft.bad) return { text: String(draftText ?? '') };
  const kind = fileKind(path);
  if (kind === 'video') return videoDelta(base.value, draft.value);
  if (kind === 'descriptors') return descriptorDelta(base.value, draft.value);
  if (kind === 'library') return libraryDelta(base.value, draft.value);
  if (kind === 'clips') return clipsDelta(base.value, draft.value);
  return same(base.value, draft.value) ? null : { text: String(draftText ?? '') };
}

// One portable string for every draft. VA2 keeps only what changed. Empty when nothing differs.
export function encodeChangeCode(drafts, bases = {}) {
  const files = {};
  for (const draft of drafts || []) {
    if (!allowedPath(draft.path)) continue;
    if (draft.deleted) {
      files[draft.path] = { deleted: true };
      continue;
    }
    const delta = diffText(draft.path, bases[draft.path], draft.text);
    if (delta) files[draft.path] = delta;
  }
  if (!Object.keys(files).length) return '';
  return V2 + bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ v: 2, files })));
}

function pretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function applyOrder(items, order) {
  if (!Array.isArray(order)) return items;
  const pool = new Map();
  for (const item of items) if (item?.id) pool.set(item.id, item);
  const used = new Set();
  const ordered = [];
  for (const id of order) {
    if (pool.has(id) && !used.has(id)) {
      ordered.push(pool.get(id));
      used.add(id);
    }
  }
  for (const item of items) if (!item?.id || !used.has(item.id)) ordered.push(item);
  return ordered;
}

function applyNamed(list, items, deletedIds, order) {
  let next = objects(list);
  const deleted = new Set(deletedIds || []);
  next = next.filter((item) => !item.id || !deleted.has(item.id));
  for (const item of items || []) {
    if (!item || typeof item !== 'object') continue;
    const index = item.id ? next.findIndex((entry) => entry.id === item.id) : -1;
    if (index >= 0) next[index] = { ...next[index], ...item };
    else next.push(item);
  }
  return applyOrder(next, order);
}

function applyVideo(base, delta) {
  const next = { ...base, ...(delta.fields || {}) };
  let notes = objects(base.notes);
  const deleted = new Set(delta.deletedNoteIds || []);
  notes = notes.filter((note) => !note.id || !deleted.has(note.id));
  for (const note of delta.notes || []) {
    if (!note?.id) continue;
    const index = notes.findIndex((item) => item.id === note.id);
    if (index >= 0) notes[index] = note;
    else notes.push(note);
  }
  if (delta.replaceUnkeyedNotes) {
    notes = notes.filter((note) => note.id);
    notes.push(...delta.replaceUnkeyedNotes);
  }
  next.notes = applyOrder(notes, delta.noteOrder);
  return next;
}

// Turns a VA2 entry into the full file text, using the current project file as the base.
export function applyChange(path, baseText, delta) {
  if (delta && typeof delta.text === 'string') return delta.text;
  const base = parseObject(baseText);
  if (base.missing || base.bad) throw new Error(`Couldn't apply a change to ${path} because that project file is missing or isn't valid JSON.`);
  const kind = fileKind(path);
  let next;
  if (kind === 'video') next = applyVideo(base.value, delta || {});
  else if (kind === 'descriptors') {
    next = { ...base.value, ...(delta?.fields || {}) };
    next.tags = applyNamed(base.value.tags, delta?.tags, delta?.deletedTagIds, delta?.tagOrder);
    next.markers = applyNamed(base.value.markers, delta?.markers, delta?.deletedMarkerIds, delta?.markerOrder);
  } else if (kind === 'library') {
    next = { ...base.value, ...(delta?.fields || {}) };
    if (delta?.videos) next.videos = delta.videos;
  } else if (kind === 'clips') {
    next = { ...base.value, ...(delta?.fields || {}) };
    next.clips = applyNamed(base.value.clips, delta?.clips, delta?.deletedClipIds, null);
    next.collections = applyNamed(base.value.collections, delta?.collections, delta?.deletedCollectionIds, null);
  } else throw new Error(`The change code updates a file this app doesn't know how to merge (${path}).`);
  return pretty(next);
}

export function decodeChangeCode(code) {
  const raw = String(code || '').trim().replace(/\s+/g, '');
  const version = raw.startsWith(V2) ? 2 : raw.startsWith(V1) ? 1 : 0;
  if (!version) throw new Error('That is not a change code.');
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(raw.slice(version === 2 ? V2.length : V1.length))));
  } catch {
    throw new Error('That change code could not be read.');
  }
  if (!payload || payload.v !== version || !payload.files || typeof payload.files !== 'object' || Array.isArray(payload.files)) {
    throw new Error('That change code is not a version this app understands.');
  }
  const files = [];
  for (const [path, entry] of Object.entries(payload.files)) {
    if (!allowedPath(path)) throw new Error(`The change code includes a file this app will not import (${path}).`);
    if (entry && entry.deleted === true) files.push({ path, deleted: true });
    else if (entry && typeof entry.text === 'string') files.push({ path, text: entry.text });
    else if (version === 2 && entry && typeof entry === 'object') files.push({ path, delta: entry });
    else throw new Error(`The change code is missing the contents of ${path}.`);
  }
  if (!files.length) throw new Error('That change code has no files.');
  return files;
}
