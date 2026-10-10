import { config } from '../../config.js';
import { displayTimeTokens, formatTime } from '../../core/time.js';

const VIDEO_FILE = /^data\/videos\/([^/]+)\.json$/;

const fallbackNames = {
  videoTitle: (id) => id,
  tagName: (id) => id,
  markerName: (id) => id,
};

function fileKind(path) {
  if (path === config.paths.library) return 'library';
  if (path === config.paths.descriptors) return 'descriptors';
  if (VIDEO_FILE.test(path)) return 'video';
  return 'other';
}

function parse(text) {
  if (text == null) return { ok: true, missing: true, value: null };
  try {
    return { ok: true, missing: false, value: JSON.parse(text) };
  } catch {
    return { ok: false, missing: false, value: null };
  }
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function plain(text) {
  return displayTimeTokens(text || '').replace(/\s+/g, ' ').trim();
}

function clip(text, max = 140) {
  const s = plain(text);
  if (!s) return 'empty';
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
}

function show(value) {
  if (value == null || value === '') return 'empty';
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return clip(value);
}

function clock(seconds) {
  const n = Number(seconds);
  return Number.isFinite(n) ? formatTime(n) : show(seconds);
}

function noteHeading(note) {
  const title = String(note?.title || '').trim();
  const body = plain(note?.content);
  const name = title || (body.length > 72 ? `${body.slice(0, 71)}\u2026` : body) || 'Untitled note';
  if (note?.type === 'timestamp' && note.timestamp != null && note.timestamp !== '') return `${clock(note.timestamp)} \u00b7 ${name}`;
  return `General \u00b7 ${name}`;
}

function noteBody(note) {
  const body = displayTimeTokens(note?.content || '').trim();
  const title = String(note?.title || '').trim();
  if (!body) return null;
  if (!title && plain(body).length <= 72) return null;
  return body;
}

function idChanges(before, after, nameOf, label) {
  const prev = new Set(list(before));
  const next = new Set(list(after));
  const added = [...next].filter((id) => !prev.has(id)).map(nameOf);
  const removed = [...prev].filter((id) => !next.has(id)).map(nameOf);
  if (!added.length && !removed.length) return '';
  const parts = [];
  if (added.length) parts.push(`added ${added.join(', ')}`);
  if (removed.length) parts.push(`removed ${removed.join(', ')}`);
  return `${label}: ${parts.join('; ')}`;
}

function noteFacts(note, names) {
  const lines = [];
  const tags = list(note?.tags).map(names.tagName);
  const markers = list(note?.markers).map(names.markerName);
  if (tags.length) lines.push(`Tags: ${tags.join(', ')}`);
  if (markers.length) lines.push(`Markers: ${markers.join(', ')}`);
  if (note?.visibility === 'private') lines.push('Private');
  return lines;
}

function changedNote(before, after, names) {
  const lines = [];
  if (before?.type !== after?.type || before?.timestamp !== after?.timestamp) lines.push(`Was ${noteHeading(before)}`);
  else if ((before?.title || '') !== (after?.title || '')) lines.push(`Title: ${show(before?.title)} \u2192 ${show(after?.title)}`);
  const tags = idChanges(before?.tags, after?.tags, names.tagName, 'Tags');
  const markers = idChanges(before?.markers, after?.markers, names.markerName, 'Markers');
  if (tags) lines.push(tags);
  if (markers) lines.push(markers);
  if ((before?.visibility || 'public') !== (after?.visibility || 'public')) {
    lines.push(`Visibility: ${show(before?.visibility || 'public')} \u2192 ${show(after?.visibility || 'public')}`);
  }
  const textChanged = (before?.content || '') !== (after?.content || '');
  if (textChanged) lines.unshift('Note text differs from the project file.');
  if (!lines.length) return null;
  const item = { kind: 'changed', title: noteHeading(after), lines };
  if (textChanged) {
    item.text = displayTimeTokens(after?.content || '').trim();
    item.savedText = displayTimeTokens(before?.content || '').trim();
  }
  return item;
}

function addedNote(note, names) {
  const item = { kind: 'added', title: noteHeading(note), lines: noteFacts(note, names) };
  const body = noteBody(note);
  if (body) item.text = body;
  return item;
}

function sourceSame(key, prev, next) {
  if (key === 'noFile') return Boolean(prev) === Boolean(next);
  if (key === 'offsetSeconds') return Number(prev || 0) === Number(next || 0);
  return (prev ?? '') === (next ?? '');
}

function sourceLines(before = {}, after = {}) {
  const fields = [
    ['local', 'Local file'],
    ['youtube', 'YouTube id'],
    ['offsetSeconds', 'Start offset'],
    ['noFile', 'No local file'],
  ];
  const lines = [];
  for (const [key, label] of fields) {
    if (sourceSame(key, before?.[key], after?.[key])) continue;
    lines.push(`${label}: ${show(before?.[key])} \u2192 ${show(after?.[key])}`);
  }
  return lines;
}

function videoDetailChanges(saved, draft) {
  const lines = [];
  for (const [key, label] of [
    ['title', 'Title'],
    ['description', 'Description'],
    ['visibility', 'Visibility'],
  ]) {
    if ((saved?.[key] ?? '') !== (draft?.[key] ?? '')) lines.push(`${label}: ${show(saved?.[key])} \u2192 ${show(draft?.[key])}`);
  }
  if ((saved?.duration ?? null) !== (draft?.duration ?? null)) lines.push(`Duration: ${clock(saved?.duration)} \u2192 ${clock(draft?.duration)}`);
  lines.push(...sourceLines(saved?.sources, draft?.sources));
  if (!lines.length) return [];
  return [{ kind: 'changed', title: 'Video details', lines }];
}

function videoNotes(saved, draft, names) {
  const items = [];
  const before = list(saved?.notes).filter((n) => n && typeof n === 'object');
  const after = list(draft?.notes).filter((n) => n && typeof n === 'object');
  const beforeById = new Map(before.filter((n) => n.id).map((n) => [n.id, n]));
  const afterById = new Map(after.filter((n) => n.id).map((n) => [n.id, n]));
  for (const note of after) {
    if (!note.id || !beforeById.has(note.id)) items.push(addedNote(note, names));
    else {
      const changed = changedNote(beforeById.get(note.id), note, names);
      if (changed) items.push(changed);
    }
  }
  for (const note of before) {
    if (!note.id || !afterById.has(note.id)) {
      const item = { kind: 'removed', title: noteHeading(note), lines: ['This note is still in the project file.'] };
      const body = noteBody(note);
      if (body) item.savedText = body;
      items.push(item);
    }
  }
  const beforeIds = before.map((n) => n.id).filter(Boolean);
  const afterIds = after.map((n) => n.id).filter(Boolean);
  const sameSet = beforeIds.length === afterIds.length && beforeIds.every((id) => afterById.has(id));
  if (sameSet && beforeIds.some((id, i) => id !== afterIds[i])) {
    items.push({ kind: 'changed', title: 'Note order', lines: ['The notes are in a different order than the project file.'] });
  }
  return items;
}

function namedItem(kind, noun, item, lines) {
  const name = String(item?.name || item?.id || noun).trim() || noun;
  return { kind, title: `${noun} \u201c${name}\u201d`, lines };
}

function descriptorFacts(item) {
  const lines = [];
  if (item?.description) lines.push(item.description);
  if (item?.color) lines.push(`Color ${item.color}`);
  if (item?.date) lines.push(`Date ${item.date}`);
  return lines;
}

function descriptorChanges(before, after) {
  const lines = [];
  if ((before?.name || '') !== (after?.name || '')) lines.push(`Name: ${show(before?.name)} \u2192 ${show(after?.name)}`);
  if ((before?.description || '') !== (after?.description || '')) lines.push(`Description: ${show(before?.description)} \u2192 ${show(after?.description)}`);
  if ((before?.color || '') !== (after?.color || '')) lines.push(`Color: ${show(before?.color)} \u2192 ${show(after?.color)}`);
  if ((before?.date || '') !== (after?.date || '')) lines.push(`Date: ${show(before?.date)} \u2192 ${show(after?.date)}`);
  if ((before?.order ?? '') !== (after?.order ?? '')) lines.push(`Order: ${show(before?.order)} \u2192 ${show(after?.order)}`);
  return lines;
}

function diffNamedList(savedList, draftList, noun) {
  const items = [];
  const before = list(savedList).filter((x) => x && typeof x === 'object');
  const after = list(draftList).filter((x) => x && typeof x === 'object');
  const beforeById = new Map(before.filter((x) => x.id).map((x) => [x.id, x]));
  const afterById = new Map(after.filter((x) => x.id).map((x) => [x.id, x]));
  for (const item of after) {
    if (!item.id || !beforeById.has(item.id)) items.push(namedItem('added', noun, item, descriptorFacts(item)));
    else {
      const lines = descriptorChanges(beforeById.get(item.id), item);
      if (lines.length) items.push(namedItem('changed', noun, item, lines));
    }
  }
  for (const item of before) {
    if (!item.id || !afterById.has(item.id)) items.push(namedItem('removed', noun, item, ['Still in the project file.']));
  }
  return items;
}

function libraryItems(saved, draft, names, kind) {
  const items = [];
  const before = list(saved?.videos).map(String);
  const after = list(draft?.videos).map(String);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  for (const id of after) {
    if (!beforeSet.has(id)) {
      items.push({
        kind: 'added',
        title: names.videoTitle(id),
        lines: [`${id} is listed in the library only in this browser.`],
      });
    }
  }
  for (const id of before) {
    if (!afterSet.has(id)) {
      items.push({
        kind: 'removed',
        title: names.videoTitle(id),
        lines: [`${id} is still listed in the project library.`],
      });
    }
  }
  const sameIds = before.length === after.length && before.every((id) => afterSet.has(id));
  if (sameIds && before.some((id, i) => id !== after[i])) {
    items.push({ kind: 'changed', title: 'Library order', lines: ['The videos are in a different order than the project file.'] });
  }
  if (kind === 'added' && !items.length) {
    items.push({ kind: 'added', title: 'New library file', lines: ['This file is not in the project yet.'] });
  }
  return items;
}

function videoIntro(draft) {
  const lines = [];
  if (draft?.title) lines.push(`Title: ${draft.title}`);
  if (draft?.description) lines.push(clip(draft.description, 220));
  if (draft?.visibility === 'private') lines.push('Private video');
  if (draft?.sources?.youtube) lines.push(`YouTube: ${draft.sources.youtube}`);
  if (draft?.sources?.local) lines.push(`Local file: ${draft.sources.local}`);
  if (draft?.sources?.noFile) lines.push('No local file');
  return { kind: 'added', title: draft?.title || draft?.id || 'New video file', lines };
}

function diffFile(path, saved, draft, names) {
  const kind = fileKind(path);
  if (kind === 'library') return libraryItems(saved, draft, names);
  if (kind === 'descriptors') return [...diffNamedList(saved?.tags, draft?.tags, 'Tag'), ...diffNamedList(saved?.markers, draft?.markers, 'Marker')];
  if (kind === 'video') return [...videoDetailChanges(saved, draft), ...videoNotes(saved, draft, names)];
  return genericChanges(saved, draft);
}

function addedFile(path, draft, names) {
  const kind = fileKind(path);
  if (kind === 'library') return libraryItems(null, draft, names, 'added');
  if (kind === 'descriptors') {
    const items = [...diffNamedList([], draft?.tags, 'Tag'), ...diffNamedList([], draft?.markers, 'Marker')];
    return items.length ? items : [{ kind: 'added', title: 'New descriptors file', lines: ['This file is not in the project yet.'] }];
  }
  if (kind === 'video') return [videoIntro(draft), ...videoNotes(null, draft, names)];
  return [{ kind: 'added', title: 'New file', lines: ['This file is not in the project yet.'] }];
}

function genericChanges(saved, draft) {
  if (!draft || typeof draft !== 'object') return [];
  const keys = new Set([...Object.keys(saved || {}), ...Object.keys(draft || {})]);
  const lines = [];
  for (const key of keys) {
    if (key.startsWith('__') || key === 'updatedAt' || key === 'createdAt' || key === 'schemaVersion') continue;
    if (JSON.stringify(saved?.[key] ?? null) !== JSON.stringify(draft?.[key] ?? null)) lines.push(`${key} differs from the project file`);
  }
  if (!lines.length) return [];
  return [{ kind: 'changed', title: 'File contents', lines }];
}

function removedFile(path, saved) {
  if (!saved) return [{ kind: 'removed', title: 'Marked for deletion', lines: ['The project file is already gone, and this deletion is still only in this browser.'] }];
  const kind = fileKind(path);
  if (kind === 'video') {
    const count = list(saved.notes).length;
    return [{
      kind: 'removed',
      title: saved.title || saved.id || 'Video file',
      lines: ['This video is marked for deletion and is still in the project.', count ? `${count} ${count === 1 ? 'note' : 'notes'} in that file.` : 'No notes in that file.'],
    }];
  }
  if (kind === 'library') return [{ kind: 'removed', title: 'Library file', lines: ['data/library.json is marked for deletion and is still in the project.'] }];
  if (kind === 'descriptors') return [{ kind: 'removed', title: 'Tags and markers', lines: ['data/descriptors.json is marked for deletion and is still in the project.'] }];
  return [{ kind: 'removed', title: 'Marked for deletion', lines: ['This file is still in the project.'] }];
}

function unchangedFallback() {
  return [{
    kind: 'changed',
    title: 'File text differs',
    lines: ['The notes and details match the project file. The draft is still here because the saved text is not identical, often only the updated time.'],
  }];
}

// Human-readable list of what a draft adds, changes, or removes compared with the project file.
export function summarizeDraft(path, draft, savedText, names = fallbackNames) {
  const resolved = { ...fallbackNames, ...names };
  if (draft?.deleted) {
    const saved = parse(savedText);
    if (!saved.ok) return [{ kind: 'removed', title: 'Marked for deletion', lines: ['The project file could not be read, so its contents are not listed. The deletion is not saved.'] }];
    return removedFile(path, saved.missing ? null : saved.value);
  }
  const next = parse(draft?.text);
  if (!next.ok) return [{ kind: 'changed', title: 'Unsaved file', lines: ['This draft is not valid JSON, so the individual changes cannot be listed. Download the file to inspect it.'] }];
  const saved = parse(savedText);
  if (!saved.ok) return [{ kind: 'changed', title: 'Unsaved file', lines: ['The project file is not valid JSON, so the changes cannot be compared.'] }];
  const items = saved.missing ? addedFile(path, next.value, resolved) : diffFile(path, saved.value, next.value, resolved);
  return items.length ? items : unchangedFallback();
}
