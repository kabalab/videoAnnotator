import { config } from '../config.js';
import { store, state, canEdit, showPrivate, getVideo, editorActive } from '../core/store.js';
import { randomId, slugify, uniqueId } from '../core/ids.js';
import { parseTime } from '../core/time.js';
import { fetchText, parseJson, LoadError } from '../storage/httpSource.js';
import { draftStore } from '../storage/draftStore.js';
import { downloadText, downloadMany } from '../storage/exporter.js';
import { encodeChangeCode, decodeChangeCode, applyChange } from '../storage/changeCode.js';
import { validateLibrary, validateDescriptors, validateVideo, validateClips } from './validate.js';
import { applyVisibility, applyClipVisibility } from './visibility.js';
import { serializeVideo, serializeDescriptors, serializeLibrary, serializeClips, toJsonText, nowIso, newVideo } from './schema.js';

// The only module that changes application data. Every mutation follows the same steps:
// validate -> update the in-memory model -> emit a store event -> persist -> emit 'save'.

const P = config.paths;
let fsa = null;
let fsaReason = null;
const knownModified = new Map();
let libraryExtra = {};
let libraryQuarantine = [];
let libraryFolderQuarantine = [];
let libraryBroken = false;
let descriptorsBroken = false;
let clipsBroken = false;

export const hooks = {
  // Replaced by main.js with a dialog. Returns 'overwrite' | 'reload' | 'cancel'.
  onConflict: async () => 'overwrite',
};

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const setPersistence = (p) => store.set({ persistence: p }, 'persistence');
const connected = () => state.persistence.kind === 'fsa-connected';
const refreshDrafts = () => store.set({ drafts: draftStore.list() }, 'drafts');
const basename = (p) => String(p || '').split('/').pop();
const isMedia = (name) => config.videoExtensions.some((e) => name.toLowerCase().endsWith(e));
const normalizeEol = (s) => String(s).replace(/\r\n/g, '\n');

export const isConnected = connected;
export const fsaAvailable = () => !!fsa;
export const fsaUnavailableReason = () => fsaReason;

// ---------------------------------------------------------------- persistence setup

export async function initPersistence() {
  if (!state.env.isLocal) {
    setPersistence({ kind: 'public' });
    return;
  }
  const mod = await import('../storage/fsaSource.js');
  const support = mod.fsaSupport();
  if (!support.ok) {
    fsaReason = support.reason;
    setPersistence({ kind: 'fallback', reason: support.reason });
    return;
  }
  fsa = new mod.FsaSource();
  let status = 'none';
  try {
    status = await fsa.restore();
  } catch (e) {
    console.warn('Could not restore the remembered project folder', e);
  }
  try {
    setExternal(await fsa.restoreExternal());
  } catch {
    setExternal('none');
  }
  if (status === 'granted') setPersistence({ kind: 'fsa-connected', folder: fsa.folderName });
  else if (status === 'prompt') setPersistence({ kind: 'fsa-needs-permission', folder: fsa.folderName });
  else setPersistence({ kind: 'fsa-disconnected' });
}

function setExternal(kind) {
  store.set({ external: { kind, name: fsa?.externalName || '' } }, ['persistence', 'external']);
}

// ---------------------------------------------------------------- loading

async function readFile(path) {
  if (connected()) {
    try {
      const { text, lastModified } = await fsa.readText(path);
      knownModified.set(path, lastModified);
      return text;
    } catch (e) {
      if (e instanceof LoadError) throw e;
      setPersistence({
        kind: 'fsa-error',
        folder: fsa.folderName,
        reason: `Couldn't read ${path} from the project folder (${e.name}: ${e.message}).`,
      });
    }
  }
  return fetchText(path);
}

// The project file as stored, without this browser's draft layered on top. Null when the file is absent.
export async function readProjectText(path) {
  if (connected()) {
    try {
      return (await fsa.readText(path)).text;
    } catch (e) {
      if (e instanceof LoadError && e.kind === 'missing') return null;
      throw e;
    }
  }
  try {
    return await fetchText(path);
  } catch (e) {
    if (e instanceof LoadError && e.kind === 'missing') return null;
    throw e;
  }
}

async function readJson(path) {
  let text = null;
  let error = null;
  try {
    text = await readFile(path);
  } catch (e) {
    error = e;
  }
  if (editorActive()) {
    const draft = draftStore.get(path);
    if (draft) {
      if (draft.deleted) {
        if (error?.kind === 'missing') draftStore.remove(path);
      } else if (text !== null && normalizeEol(draft.text) === normalizeEol(text)) {
        draftStore.remove(path);
      } else {
        text = draft.text;
        error = null;
      }
    }
  }
  if (error) throw error;
  return parseJson(text, path);
}

export async function loadAll() {
  const issues = [];
  let fatal = null;
  let libraryIds = [];
  let libraryFolders = [];
  try {
    const r = validateLibrary(await readJson(P.library), P.library);
    libraryIds = r.ids;
    libraryFolders = r.folders;
    libraryExtra = r.extra;
    libraryQuarantine = r.quarantine;
    libraryFolderQuarantine = r.folderQuarantine;
    issues.push(...r.issues);
    libraryBroken = false;
  } catch (e) {
    fatal = { path: P.library, message: e.message };
    libraryBroken = true;
    libraryFolderQuarantine = [];
  }

  let descriptors = { tags: [], markers: [], __quarantine: { tags: [], markers: [] } };
  try {
    const r = validateDescriptors(await readJson(P.descriptors), P.descriptors);
    descriptors = r.descriptors;
    issues.push(...r.issues);
    descriptorsBroken = false;
  } catch (e) {
    descriptorsBroken = true;
    issues.push({ path: P.descriptors, level: 'error', message: `${e.message} Tags and markers are unavailable, and can't be edited, until it's fixed.` });
  }

  const results = await Promise.all(
    libraryIds.map(async (id) => {
      const path = P.videoData(id);
      try {
        return { id, path, ...validateVideo(await readJson(path), id, path) };
      } catch (e) {
        return { id, path, error: e };
      }
    }),
  );

  const videos = new Map();
  const videoErrors = new Map();
  for (const r of results) {
    if (r.error) {
      videoErrors.set(r.id, { path: r.path, message: r.error.message });
      issues.push({ path: r.path, level: 'error', message: r.error.message });
      continue;
    }
    issues.push(...r.issues);
    const visible = applyVisibility(r.video, showPrivate());
    if (visible) videos.set(r.id, visible);
  }

  let clips = { clips: [], collections: [], folders: [], __quarantine: { clips: [], collections: [], folders: [] } };
  try {
    const r = validateClips(await readJson(P.clips), P.clips);
    clips = applyClipVisibility(r.clips, [...videos.values()], showPrivate());
    issues.push(...r.issues);
    clipsBroken = false;
  } catch (e) {
    clipsBroken = true;
    issues.push({ path: P.clips, level: 'error', message: `${e.message} Clips are unavailable, and can't be edited, until it's fixed.` });
  }

  store.set({ libraryIds, libraryFolders, descriptors, clips, videos, videoErrors, issues: showPrivate() ? issues : [], fatal }, ['data', 'descriptors', 'clips', 'issues']);
  if (editorActive()) refreshDrafts();
  scanUnregistered();
}

export const descriptorsAvailable = () => !descriptorsBroken;

// ---------------------------------------------------------------- saving

function assertWritable() {
  if (!editorActive()) throw new Error('Editing is turned off on the public site.');
  if (state.uiMode !== 'edit') throw new Error('View mode is on. Switch to Edit mode to make changes.');
}

// Lets main.js notice when Live Server reloads the page right after a write.
function markSaving() {
  try {
    sessionStorage.setItem('va.savingAt', String(Date.now()));
  } catch {
    // ignore
  }
}

function clearSaving() {
  setTimeout(() => {
    try {
      sessionStorage.removeItem('va.savingAt');
    } catch {
      // ignore
    }
  }, 2500);
}

function keepDraft(path, text, remove) {
  if (remove) draftStore.putDeleted(path);
  else draftStore.put(path, text);
}

async function persist(path, text, { remove = false, quiet = false } = {}) {
  let result;
  if (connected()) {
    try {
      const known = knownModified.get(path);
      if (known != null) {
        const current = await fsa.lastModified(path);
        if (current != null && current > known + 1) {
          const choice = await hooks.onConflict(path);
          if (choice === 'reload') {
            await loadAll();
            result = { status: 'reloaded', path };
            store.emit('save', result);
            return result;
          }
          if (choice !== 'overwrite') {
            result = { status: 'cancelled', path };
            store.emit('save', result);
            return result;
          }
        }
      }
      markSaving();
      if (remove) {
        await fsa.remove(path);
        knownModified.delete(path);
      } else {
        knownModified.set(path, await fsa.writeText(path, text));
      }
      draftStore.remove(path);
      result = { status: 'saved', path, quiet };
    } catch (e) {
      try {
        keepDraft(path, text, remove);
        result = { status: 'draft', path, error: e };
      } catch (storageErr) {
        result = { status: 'error', path, error: storageErr };
      }
      setPersistence({ kind: 'fsa-error', folder: fsa.folderName, reason: `Couldn't save ${path}: ${e.name}: ${e.message}` });
    } finally {
      clearSaving();
    }
  } else {
    try {
      keepDraft(path, text, remove);
      result = { status: 'draft', path, quiet };
    } catch (storageErr) {
      result = { status: 'error', path, error: storageErr };
    }
  }
  refreshDrafts();
  store.emit('save', result);
  return result;
}

const persistVideo = (video, opts) => persist(P.videoData(video.id), toJsonText(serializeVideo(video)), opts);

function persistLibrary() {
  if (libraryBroken) throw new Error(`${P.library} couldn't be loaded, so the library can't be saved until it's fixed.`);
  return persist(P.library, toJsonText(serializeLibrary(state.libraryIds, libraryExtra, libraryQuarantine, state.libraryFolders, libraryFolderQuarantine)));
}

function persistDescriptors() {
  if (descriptorsBroken) throw new Error(`${P.descriptors} couldn't be loaded, so tags and markers can't be saved until it's fixed.`);
  return persist(P.descriptors, toJsonText(serializeDescriptors(state.descriptors)));
}

function persistClips() {
  if (clipsBroken) throw new Error(`${P.clips} couldn't be loaded, so clips can't be saved until it's fixed.`);
  return persist(P.clips, toJsonText(serializeClips(state.clips)));
}

function commitClips(next) {
  state.clips = next;
  store.emit('clips');
}

function commitVideo(video) {
  state.videos.set(video.id, video);
  store.emit('data', { videoId: video.id });
}

function requireVideo(id) {
  const v = getVideo(id);
  if (!v) throw new Error(`Video "${id}" isn't loaded.`);
  return v;
}

// ---------------------------------------------------------------- notes

function cleanNote(input) {
  const out = {};
  for (const [k, v] of Object.entries(input)) if (!k.startsWith('__')) out[k] = v;
  out.type = input.type === 'timestamp' ? 'timestamp' : 'generic';
  if (out.type === 'timestamp') {
    const t = parseTime(input.timestamp);
    if (t === null) throw new ValidationError('Enter a time like 12:43, 1:02:03 or a number of seconds.', 'timestamp');
    out.timestamp = Math.round(t * 10) / 10;
  } else {
    out.timestamp = null;
  }
  out.title = String(input.title || '').trim();
  out.content = String(input.content || '').replace(/\s+$/, '');
  if (!out.content.trim() && !out.title) throw new ValidationError('Write something before saving.', 'content');
  out.tags = [...new Set(input.tags || [])];
  out.markers = [...new Set(input.markers || [])];
  if (out.type !== 'timestamp' && out.markers.length > 1) throw new ValidationError('A note can only have one marker.', 'markers');
  out.visibility = input.visibility === 'private' ? 'private' : 'public';
  return out;
}

export async function saveNote(videoId, input) {
  assertWritable();
  const video = requireVideo(videoId);
  const note = cleanNote(input);
  const t = nowIso();
  const notes = [...video.notes];
  const idx = note.id ? notes.findIndex((n) => n.id === note.id) : -1;
  let saved;
  if (idx >= 0) {
    saved = { ...note, createdAt: notes[idx].createdAt || t, updatedAt: t };
    notes[idx] = saved;
  } else {
    saved = { ...note, id: note.id || randomId('n'), createdAt: t, updatedAt: t };
    notes.push(saved);
  }
  const updated = { ...video, notes, updatedAt: t };
  commitVideo(updated);
  const result = await persistVideo(updated);
  return { note: saved, result };
}

export async function deleteNote(videoId, noteId) {
  assertWritable();
  const video = requireVideo(videoId);
  const index = video.notes.findIndex((n) => n.id === noteId);
  if (index < 0) return null;
  const note = video.notes[index];
  const updated = { ...video, notes: video.notes.filter((n) => n.id !== noteId), updatedAt: nowIso() };
  commitVideo(updated);
  const result = await persistVideo(updated);
  return { note, index, result };
}

export async function restoreNote(videoId, note, index) {
  assertWritable();
  const video = requireVideo(videoId);
  if (video.notes.some((n) => n.id === note.id)) return null;
  const notes = [...video.notes];
  notes.splice(Math.min(index, notes.length), 0, note);
  const updated = { ...video, notes, updatedAt: nowIso() };
  commitVideo(updated);
  return persistVideo(updated);
}

// ---------------------------------------------------------------- videos

function cleanVideoMeta(input) {
  const title = String(input.title || '').trim();
  if (!title) throw new ValidationError('Give the video a title.', 'title');
  const noFile = !!input.noFile;
  const local = noFile ? '' : String(input.local || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const youtube = String(input.youtube || '').trim();
  if (!local && !youtube) throw new ValidationError('Add a local file or a backup YouTube link so the video can play.', 'local');
  const offset = input.offsetSeconds === '' || input.offsetSeconds == null ? 0 : Number(input.offsetSeconds);
  if (!Number.isFinite(offset)) throw new ValidationError('Offset must be a number of seconds.', 'offset');
  const sources = { local, youtube, offsetSeconds: offset };
  if (noFile) sources.noFile = true;
  return {
    title,
    description: String(input.description || '').replace(/\s+$/, ''),
    visibility: input.visibility === 'private' ? 'private' : 'public',
    sources,
  };
}

export function suggestVideoId(title) {
  const taken = new Set([...state.libraryIds, ...libraryQuarantine.map(String)]);
  return uniqueId(slugify(title), taken);
}

export async function addVideo(input) {
  assertWritable();
  if (libraryBroken) throw new Error(`${P.library} couldn't be loaded, so videos can't be added until it's fixed.`);
  const meta = cleanVideoMeta(input);
  const id = suggestVideoId(meta.title);
  const video = { ...newVideo({ id, ...meta }), __quarantine: [] };
  state.libraryIds = [...state.libraryIds, id];
  state.videos.set(id, video);
  store.emit('data', { videoId: id });
  const results = [await persistVideo(video), await persistLibrary()];
  scanUnregistered();
  return { video, results };
}

export async function updateVideo(id, input) {
  assertWritable();
  const video = requireVideo(id);
  const meta = cleanVideoMeta(input);
  const sources = { ...video.sources, ...meta.sources };
  if (!meta.sources.noFile) delete sources.noFile;
  const updated = { ...video, ...meta, sources, updatedAt: nowIso() };
  commitVideo(updated);
  const result = await persistVideo(updated);
  scanUnregistered();
  return { video: updated, result };
}

export async function removeVideo(id) {
  assertWritable();
  state.libraryIds = state.libraryIds.filter((x) => x !== id);
  state.libraryFolders = (state.libraryFolders || []).map((folder) => ({
    ...folder,
    videoIds: (folder.videoIds || []).filter((videoId) => videoId !== id),
  }));
  state.videos.delete(id);
  state.videoErrors.delete(id);
  store.emit('data', { videoId: id, removed: true });
  const results = [await persistLibrary(), await persist(P.videoData(id), null, { remove: true })];
  scanUnregistered();
  return results;
}

// Caches duration for the library. Only written when it can be saved silently to disk.
export async function updateDuration(id, duration, sourceKind) {
  const video = getVideo(id);
  if (!video || !Number.isFinite(duration) || duration <= 0) return;
  if (video.duration && (sourceKind !== 'local' || Math.abs(video.duration - duration) < 1)) return;
  const updated = { ...video, duration: Math.round(duration * 10) / 10 };
  state.videos.set(id, updated);
  if (canEdit() && connected()) await persistVideo(updated, { quiet: true });
}

// ---------------------------------------------------------------- tags & markers

const listKey = (kind) => (kind === 'tag' ? 'tags' : 'markers');

function cleanDescriptor(kind, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new ValidationError('A name is required.', 'name');
  const item = { ...input, name, description: String(input.description || '') };
  if (kind === 'tag') {
    item.color = /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color.toLowerCase() : '#8a94a6';
  }
  delete item.date;
  delete item.order;
  return item;
}

function nextTagColor() {
  const used = new Set(state.descriptors.tags.map((t) => t.color));
  return config.tagSwatches.find((c) => !used.has(c)) || config.tagSwatches[state.descriptors.tags.length % config.tagSwatches.length];
}

export async function saveDescriptor(kind, input) {
  assertWritable();
  if (descriptorsBroken) throw new Error(`${P.descriptors} couldn't be loaded, so ${listKey(kind)} can't be saved until it's fixed.`);
  const key = listKey(kind);
  const item = cleanDescriptor(kind, input);
  const list = [...state.descriptors[key]];
  if (!item.id) {
    const taken = new Set([...list.map((x) => x.id), ...(state.descriptors.__quarantine?.[key] || []).map((x) => x?.id)]);
    item.id = uniqueId(slugify(item.name), taken);
    list.push(item);
  } else {
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) {
      const merged = { ...list[i], ...item };
      delete merged.date;
      delete merged.order;
      list[i] = merged;
    } else list.push(item);
  }
  state.descriptors = { ...state.descriptors, [key]: list };
  store.emit('descriptors');
  const result = await persistDescriptors();
  return { item, result };
}

export function createDescriptor(kind, name) {
  const base = { name };
  if (kind === 'tag') base.color = nextTagColor();
  return saveDescriptor(kind, base);
}

export function usageCounts(kind) {
  const key = listKey(kind);
  const counts = new Map();
  for (const v of state.videos.values()) {
    for (const n of v.notes) for (const id of n[key]) counts.set(id, (counts.get(id) || 0) + 1);
  }
  if (kind === 'tag') {
    for (const clip of state.clips?.clips || []) for (const id of clip.tags || []) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export async function deleteDescriptor(kind, id, { removeReferences = false } = {}) {
  assertWritable();
  if (descriptorsBroken) throw new Error(`${P.descriptors} couldn't be loaded, so it can't be changed until it's fixed.`);
  const key = listKey(kind);
  const results = [];
  if (removeReferences) {
    for (const video of [...state.videos.values()]) {
      if (!video.notes.some((n) => n[key].includes(id))) continue;
      const t = nowIso();
      const updated = {
        ...video,
        notes: video.notes.map((n) => (n[key].includes(id) ? { ...n, [key]: n[key].filter((x) => x !== id), updatedAt: t } : n)),
        updatedAt: t,
      };
      commitVideo(updated);
      results.push(await persistVideo(updated));
    }
  }
  if (removeReferences && kind === 'tag' && !clipsBroken) {
    const clips = state.clips?.clips || [];
    if (clips.some((clip) => (clip.tags || []).includes(id))) {
      commitClips({
        ...state.clips,
        clips: clips.map((clip) => ((clip.tags || []).includes(id) ? { ...clip, tags: clip.tags.filter((tag) => tag !== id) } : clip)),
      });
      results.push(await persistClips());
    }
  }
  state.descriptors = { ...state.descriptors, [key]: state.descriptors[key].filter((x) => x.id !== id) };
  store.emit('descriptors');
  results.push(await persistDescriptors());
  return results;
}

// ---------------------------------------------------------------- clips

function roundTenth(n) {
  return Math.round(n * 10) / 10;
}

function cleanClip(input) {
  const title = String(input.title || '').trim();
  if (!title) throw new ValidationError('Give the clip a title.', 'title');
  const videoId = String(input.videoId || '').trim();
  if (!getVideo(videoId)) throw new ValidationError('Choose a source video.', 'video');
  const start = parseTime(input.start);
  const end = parseTime(input.end);
  if (start == null) throw new ValidationError('Enter a start time like 1:30.', 'start');
  if (end == null) throw new ValidationError('Enter an end time like 3:30.', 'end');
  if (!(end > start)) throw new ValidationError('End must be after start.', 'end');
  return {
    videoId,
    start: roundTenth(start),
    end: roundTenth(end),
    title,
    description: String(input.description || '').replace(/\s+$/, ''),
    tags: [...new Set(input.tags || [])],
  };
}

export async function saveClip(input) {
  assertWritable();
  if (clipsBroken) throw new Error(`${P.clips} couldn't be loaded, so clips can't be saved until it's fixed.`);
  const clean = cleanClip(input);
  const clips = [...(state.clips.clips || [])];
  const idx = input.id ? clips.findIndex((clip) => clip.id === input.id) : -1;
  const saved = idx >= 0 ? { ...clips[idx], ...clean, id: clips[idx].id } : { ...clean, id: randomId('c') };
  if (idx >= 0) clips[idx] = saved;
  else clips.push(saved);
  commitClips({ ...state.clips, clips });
  const result = await persistClips();
  return { clip: saved, result };
}

export async function deleteClip(id) {
  assertWritable();
  if (clipsBroken) throw new Error(`${P.clips} couldn't be loaded, so clips can't be saved until it's fixed.`);
  const clip = (state.clips.clips || []).find((item) => item.id === id);
  if (!clip) return null;
  const previousCollections = (state.clips.collections || []).map((collection) => ({ ...collection, clipIds: [...(collection.clipIds || [])] }));
  const collections = previousCollections.map((collection) => ({
    ...collection,
    clipIds: collection.clipIds.filter((clipId) => clipId !== id),
  }));
  const previousFolders = (state.clips.folders || []).map((folder) => ({ ...folder, clipIds: [...(folder.clipIds || [])] }));
  const folders = previousFolders.map((folder) => ({
    ...folder,
    clipIds: folder.clipIds.filter((clipId) => clipId !== id),
  }));
  commitClips({
    ...state.clips,
    clips: state.clips.clips.filter((item) => item.id !== id),
    collections,
    folders,
  });
  const result = await persistClips();
  return { clip, collections: previousCollections, folders: previousFolders, result };
}

export async function restoreClip(clip, collections, folders) {
  assertWritable();
  if (clipsBroken) throw new Error(`${P.clips} couldn't be loaded, so clips can't be saved until it's fixed.`);
  if (!clip || (state.clips.clips || []).some((item) => item.id === clip.id)) return null;
  commitClips({
    ...state.clips,
    clips: [...state.clips.clips, clip],
    collections: collections || state.clips.collections,
    folders: folders || state.clips.folders,
  });
  return persistClips();
}

function uniqueClipIds(ids) {
  const seen = new Set();
  const out = [];
  for (const raw of ids || []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function cleanCollection(input) {
  const title = String(input.title || '').trim();
  if (!title) throw new ValidationError('Give the collection a title.', 'title');
  const collection = {
    title,
    description: String(input.description || '').replace(/\s+$/, ''),
    clipIds: uniqueClipIds(input.clipIds),
  };
  if (input.shuffle) collection.shuffle = true;
  return collection;
}

export async function saveCollection(input) {
  assertWritable();
  if (clipsBroken) throw new Error(`${P.clips} couldn't be loaded, so collections can't be saved until it's fixed.`);
  const clean = cleanCollection(input);
  const collections = [...(state.clips.collections || [])];
  const idx = input.id ? collections.findIndex((collection) => collection.id === input.id) : -1;
  const saved = idx >= 0 ? { ...collections[idx], ...clean, id: collections[idx].id } : { ...clean, id: randomId('k') };
  if (!clean.shuffle) delete saved.shuffle;
  if (idx >= 0) collections[idx] = saved;
  else collections.push(saved);
  commitClips({ ...state.clips, collections });
  const result = await persistClips();
  return { collection: saved, result };
}

export async function deleteCollection(id) {
  assertWritable();
  if (clipsBroken) throw new Error(`${P.clips} couldn't be loaded, so collections can't be saved until it's fixed.`);
  const collection = (state.clips.collections || []).find((item) => item.id === id);
  if (!collection) return null;
  commitClips({ ...state.clips, collections: state.clips.collections.filter((item) => item.id !== id) });
  const result = await persistClips();
  return { collection, result };
}

export async function restoreCollection(collection) {
  assertWritable();
  if (clipsBroken) throw new Error(`${P.clips} couldn't be loaded, so collections can't be saved until it's fixed.`);
  if (!collection || (state.clips.collections || []).some((item) => item.id === collection.id)) return null;
  commitClips({ ...state.clips, collections: [...state.clips.collections, collection] });
  return persistClips();
}

function cleanClipFolder(input) {
  const title = String(input.title || '').trim();
  if (!title) throw new ValidationError('Give the folder a name.', 'title');
  const folder = {
    title,
    description: String(input.description || '').replace(/\s+$/, ''),
    clipIds: uniqueClipIds(input.clipIds),
  };
  if (input.shuffle) folder.shuffle = true;
  return folder;
}

export async function saveClipFolder(input) {
  assertWritable();
  if (clipsBroken) throw new Error(`${P.clips} couldn't be loaded, so folders can't be saved until it's fixed.`);
  const clean = cleanClipFolder(input);
  const folders = [...(state.clips.folders || [])];
  const idx = input.id ? folders.findIndex((folder) => folder.id === input.id) : -1;
  const saved = idx >= 0 ? { ...folders[idx], ...clean, id: folders[idx].id } : { ...clean, id: randomId('cf') };
  if (!clean.shuffle) delete saved.shuffle;
  if (idx >= 0) folders[idx] = saved;
  else folders.push(saved);
  commitClips({ ...state.clips, folders });
  const result = await persistClips();
  return { folder: saved, result };
}

export async function deleteClipFolder(id) {
  assertWritable();
  if (clipsBroken) throw new Error(`${P.clips} couldn't be loaded, so folders can't be saved until it's fixed.`);
  const folder = (state.clips.folders || []).find((item) => item.id === id);
  if (!folder) return null;
  commitClips({ ...state.clips, folders: state.clips.folders.filter((item) => item.id !== id) });
  const result = await persistClips();
  return { folder, result };
}

export async function restoreClipFolder(folder) {
  assertWritable();
  if (clipsBroken) throw new Error(`${P.clips} couldn't be loaded, so folders can't be saved until it's fixed.`);
  if (!folder || (state.clips.folders || []).some((item) => item.id === folder.id)) return null;
  commitClips({ ...state.clips, folders: [...state.clips.folders, folder] });
  return persistClips();
}

function folderLinks(folders, replacementFor, replacementIds) {
  const links = new Map((folders || []).map((folder) => [folder.id, folder.id === replacementFor ? replacementIds : folder.folderIds || []]));
  if (replacementFor && !links.has(replacementFor)) links.set(replacementFor, replacementIds);
  return links;
}

function folderReaches(startId, targetId, links) {
  const seen = new Set();
  const walk = (id) => {
    for (const next of links.get(id) || []) {
      if (next === targetId) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      if (walk(next)) return true;
    }
    return false;
  };
  return walk(startId);
}

function cleanVideoFolder(input, folders, selfId) {
  const title = String(input.title || '').trim();
  if (!title) throw new ValidationError('Give the folder a name.', 'title');
  const folderIds = uniqueClipIds(input.folderIds).filter((id) => id !== selfId);
  const links = folderLinks(folders, selfId, folderIds);
  if (selfId && folderIds.some((id) => folderReaches(id, selfId, links))) {
    throw new ValidationError('A folder can\u2019t contain itself, even through other folders.', 'folders');
  }
  return {
    title,
    description: String(input.description || '').replace(/\s+$/, ''),
    videoIds: uniqueClipIds(input.videoIds),
    folderIds,
  };
}

export async function saveVideoFolder(input) {
  assertWritable();
  if (libraryBroken) throw new Error(`${P.library} couldn't be loaded, so folders can't be saved until it's fixed.`);
  const clean = cleanVideoFolder(input, state.libraryFolders, input.id || '');
  const folders = [...(state.libraryFolders || [])];
  const idx = input.id ? folders.findIndex((folder) => folder.id === input.id) : -1;
  const saved = idx >= 0 ? { ...folders[idx], ...clean, id: folders[idx].id } : { ...clean, id: randomId('f') };
  if (!saved.folderIds.length) delete saved.folderIds;
  if (idx >= 0) folders[idx] = saved;
  else folders.push(saved);
  state.libraryFolders = folders;
  store.emit('data');
  const result = await persistLibrary();
  return { folder: saved, result };
}

export async function deleteVideoFolder(id) {
  assertWritable();
  if (libraryBroken) throw new Error(`${P.library} couldn't be loaded, so folders can't be saved until it's fixed.`);
  const folder = (state.libraryFolders || []).find((item) => item.id === id);
  if (!folder) return null;
  const parentIds = [];
  state.libraryFolders = state.libraryFolders.flatMap((item) => {
    if (item.id === id) return [];
    if (!(item.folderIds || []).includes(id)) return [item];
    parentIds.push(item.id);
    const next = { ...item, folderIds: item.folderIds.filter((folderId) => folderId !== id) };
    if (!next.folderIds.length) delete next.folderIds;
    return [next];
  });
  store.emit('data');
  const result = await persistLibrary();
  return { folder, parentIds, result };
}

export async function restoreVideoFolder(folder, parentIds = []) {
  assertWritable();
  if (libraryBroken) throw new Error(`${P.library} couldn't be loaded, so folders can't be saved until it's fixed.`);
  if (!folder || (state.libraryFolders || []).some((item) => item.id === folder.id)) return null;
  const parents = new Set(parentIds);
  state.libraryFolders = [...state.libraryFolders, folder].map((item) => {
    if (!parents.has(item.id) || (item.folderIds || []).includes(folder.id)) return item;
    return { ...item, folderIds: [...(item.folderIds || []), folder.id] };
  });
  store.emit('data');
  return persistLibrary();
}

// ---------------------------------------------------------------- folder connection

export async function connectFolder() {
  if (!fsa) throw new Error(fsaReason || 'Direct file access isn\u2019t available in this browser.');
  await fsa.pick();
  knownModified.clear();
  setPersistence({ kind: 'fsa-connected', folder: fsa.folderName });
  await loadAll();
}

export async function allowFolderAccess() {
  await fsa.requestPermission();
  knownModified.clear();
  setPersistence({ kind: 'fsa-connected', folder: fsa.folderName });
  await loadAll();
}

export async function retryConnection() {
  await fsa.requestPermission();
  setPersistence({ kind: 'fsa-connected', folder: fsa.folderName });
  if (draftStore.count()) await writeDraftsToFiles();
  else await loadAll();
}

export async function disconnectFolder() {
  await fsa.disconnect();
  knownModified.clear();
  setPersistence({ kind: 'fsa-disconnected' });
  store.set({ unregistered: [] }, 'unregistered');
}

export async function writeDraftsToFiles() {
  if (!connected()) throw new Error('Connect the project folder first.');
  const errors = [];
  markSaving();
  for (const d of draftStore.list()) {
    try {
      if (d.deleted) await fsa.remove(d.path);
      else knownModified.set(d.path, await fsa.writeText(d.path, d.text));
      draftStore.remove(d.path);
    } catch (e) {
      errors.push(`${d.path}: ${e.name}: ${e.message}`);
    }
  }
  clearSaving();
  refreshDrafts();
  if (errors.length) {
    setPersistence({ kind: 'fsa-error', folder: fsa.folderName, reason: `Couldn't write ${errors.join('; ')}` });
    throw new Error(errors.join('\n'));
  }
  await loadAll();
}

export function discardDrafts() {
  draftStore.clear();
  refreshDrafts();
  return loadAll();
}

export function downloadDraft(path) {
  const d = draftStore.get(path);
  if (d && !d.deleted) downloadText(path, d.text);
}

export function downloadAllDrafts() {
  return downloadMany(draftStore.list().filter((d) => !d.deleted));
}

export async function exportChangeCode() {
  if (!editorActive()) throw new Error('Editing is turned off on the public site.');
  const drafts = draftStore.list();
  const bases = {};
  for (const draft of drafts) {
    if (draft.deleted) continue;
    bases[draft.path] = await readProjectText(draft.path);
  }
  const code = encodeChangeCode(drafts, bases);
  if (!code) throw new Error('There are no unsaved changes to copy.');
  return code;
}

// Merges the code into drafts, reloads so the changes show, and writes the files when a folder is connected.
export async function importChangeCode(code) {
  if (!editorActive()) throw new Error('Editing is turned off on the public site.');
  const files = decodeChangeCode(code);
  for (const file of files) {
    if (file.deleted) draftStore.putDeleted(file.path);
    else if (typeof file.text === 'string') draftStore.put(file.path, file.text);
    else draftStore.put(file.path, applyChange(file.path, await readProjectText(file.path), file.delta));
  }
  if (connected()) {
    try {
      await writeDraftsToFiles();
    } catch (e) {
      await loadAll();
      throw e;
    }
  } else await loadAll();
  return files.length;
}

// ---------------------------------------------------------------- video files

export async function connectExternalVideos() {
  await fsa.pickExternal();
  setExternal('granted');
  scanUnregistered();
}

export async function allowExternalVideos() {
  await fsa.requestExternalPermission();
  setExternal('granted');
  scanUnregistered();
}

export async function disconnectExternalVideos() {
  await fsa.disconnectExternal();
  setExternal('none');
  scanUnregistered();
}

export async function listVideoFiles() {
  if (!fsa || !connected()) return [];
  const project = (await fsa.listFiles(P.videosDir).catch(() => [])).filter(isMedia);
  const external = (await fsa.listExternal().catch(() => [])).filter(isMedia);
  const files = project.map((name) => ({ name, location: 'project' }));
  for (const name of external) if (!project.includes(name)) files.push({ name, location: 'external' });
  return files;
}

export async function scanUnregistered() {
  if (!state.env?.isLocal || !connected()) {
    if (state.unregistered.length) store.set({ unregistered: [] }, 'unregistered');
    return;
  }
  try {
    const files = await listVideoFiles();
    const referenced = new Set([...state.videos.values()].map((v) => basename(v.sources.local)).filter(Boolean));
    store.set({ unregistered: files.filter((f) => !referenced.has(f.name)) }, 'unregistered');
  } catch (e) {
    console.warn('Could not scan the videos folder', e);
  }
}

export async function copyVideoIntoProject(file, opts) {
  if (!connected()) throw new Error('Connect the project folder to copy videos into it.');
  markSaving();
  try {
    const name = await fsa.copyInto(P.videosDir, file, opts);
    return `${P.videosDir}/${name}`;
  } finally {
    clearSaving();
    scanUnregistered();
  }
}

// Prefers the optional external videos folder (object URL), otherwise the file served by Live Server.
export async function resolveLocalVideoUrl(localPath) {
  if (fsa?.ext) {
    const file = await fsa.externalFile(basename(localPath));
    if (file) return { url: URL.createObjectURL(file), revoke: true, via: 'external videos folder' };
  }
  return { url: localPath.split('/').map(encodeURIComponent).join('/'), revoke: false, via: 'project folder' };
}
