import { parseTime } from '../core/time.js';
import { randomId, slugify, ID_PATTERN } from '../core/ids.js';
import { parseYouTubeId } from '../features/library/youtubeUrl.js';
import { SCHEMA_VERSION, VISIBILITY, NOTE_TYPES } from './schema.js';

export class DataError extends Error {
  constructor(path, message) {
    super(message);
    this.name = 'DataError';
    this.path = path;
  }
}

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const issue = (path, message, level = 'warning') => ({ path, message, level });

function normalizeColor(c) {
  if (typeof c !== 'string') return null;
  const s = c.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  const short = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return null;
}

function stringList(value) {
  if (value == null) return { list: [], ok: true };
  if (!Array.isArray(value)) return { list: typeof value === 'string' && value ? [value] : [], ok: false };
  const list = [...new Set(value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))];
  return { list, ok: list.length === value.length };
}

export function validateLibrary(raw, path) {
  if (!isObject(raw) || !Array.isArray(raw.videos)) {
    throw new DataError(path, `${path} should be an object with a "videos" array, for example { "schemaVersion": 1, "videos": ["my-video"] }.`);
  }
  const { videos, schemaVersion, ...extra } = raw;
  const issues = [];
  const ids = [];
  const quarantine = [];
  const seen = new Set();
  videos.forEach((v, i) => {
    if (typeof v !== 'string' || !ID_PATTERN.test(v)) {
      issues.push(issue(path, `Entry ${i + 1} (${JSON.stringify(v)}) isn't a valid video id (letters, numbers, - and _). It was skipped but kept in the file.`));
      quarantine.push(v);
      return;
    }
    if (seen.has(v)) {
      issues.push(issue(path, `"${v}" is listed more than once; only the first entry is used.`));
      return;
    }
    seen.add(v);
    ids.push(v);
  });
  if (schemaVersion > SCHEMA_VERSION) issues.push(issue(path, `Written by a newer version (schemaVersion ${schemaVersion}). Some fields may be ignored.`));
  return { ids, extra, quarantine, issues };
}

function normalizeTag(item) {
  if (!isObject(item)) return { error: 'is not an object.' };
  const tag = { ...item };
  const notes = [];
  if (typeof item.id !== 'string' || !ID_PATTERN.test(item.id)) {
    if (typeof item.name === 'string' && item.name.trim()) {
      tag.id = slugify(item.name);
      notes.push(`had no valid id; using "${tag.id}".`);
    } else return { error: 'has no id or name.' };
  }
  tag.name = str(item.name).trim() || tag.id;
  const color = normalizeColor(item.color);
  if (!color && item.color !== undefined) notes.push(`has an invalid color (${JSON.stringify(item.color)}); using gray.`);
  tag.color = color || '#8a94a6';
  tag.description = str(item.description);
  return { value: tag, notes };
}

function normalizeMarker(item) {
  if (!isObject(item)) return { error: 'is not an object.' };
  const marker = { ...item };
  const notes = [];
  if (typeof item.id !== 'string' || !ID_PATTERN.test(item.id)) {
    if (typeof item.name === 'string' && item.name.trim()) {
      marker.id = slugify(item.name);
      notes.push(`had no valid id; using "${marker.id}".`);
    } else return { error: 'has no id or name.' };
  }
  marker.name = str(item.name).trim() || marker.id;
  marker.description = str(item.description);
  if (item.date !== undefined && item.date !== '' && !/^\d{4}-\d{2}(-\d{2})?$/.test(str(item.date))) {
    notes.push(`has a date that isn't YYYY-MM-DD (${JSON.stringify(item.date)}).`);
  }
  marker.date = str(item.date);
  if (item.order !== undefined && !Number.isFinite(Number(item.order))) {
    notes.push('has a non-numeric order; ignored.');
    delete marker.order;
  } else if (item.order !== undefined) marker.order = Number(item.order);
  return { value: marker, notes };
}

export function validateDescriptors(raw, path) {
  if (!isObject(raw)) throw new DataError(path, `${path} should be an object with "tags" and "markers" arrays.`);
  const issues = [];
  const quarantine = { tags: [], markers: [] };
  const { tags: rawTags, markers: rawMarkers, schemaVersion, ...extra } = raw;

  const collect = (list, kind, normalize) => {
    const out = [];
    if (list === undefined) return out;
    if (!Array.isArray(list)) {
      issues.push(issue(path, `"${kind}" should be an array. It's ignored and will be replaced the next time ${kind} are saved.`, 'error'));
      return out;
    }
    const seen = new Set();
    list.forEach((item, i) => {
      const label = `${kind === 'tags' ? 'Tag' : 'Marker'} ${isObject(item) && item.id ? `"${item.id}"` : `#${i + 1}`}`;
      const r = normalize(item);
      if (r.error) {
        issues.push(issue(path, `${label} ${r.error} Kept in the file but not shown.`));
        quarantine[kind].push(item);
        return;
      }
      r.notes.forEach((n) => issues.push(issue(path, `${label} ${n}`)));
      if (seen.has(r.value.id)) {
        issues.push(issue(path, `${label} duplicates an earlier id. Only the first is used; the duplicate stays in the file.`));
        quarantine[kind].push(item);
        return;
      }
      seen.add(r.value.id);
      out.push(r.value);
    });
    return out;
  };

  const descriptors = {
    ...extra,
    tags: collect(rawTags, 'tags', normalizeTag),
    markers: collect(rawMarkers, 'markers', normalizeMarker),
    __quarantine: quarantine,
  };
  if (schemaVersion > SCHEMA_VERSION) issues.push(issue(path, `Written by a newer version (schemaVersion ${schemaVersion}).`));
  return { descriptors, issues };
}

function normalizeNote(n, i, path, issues) {
  const where = `Note ${isObject(n) && typeof n.id === 'string' ? `"${n.id}"` : `#${i + 1}`}`;
  if (!isObject(n)) {
    issues.push(issue(path, `${where} isn't an object. It's kept in the file but hidden.`));
    return null;
  }
  const note = { ...n };
  if (typeof n.id !== 'string' || !n.id.trim()) {
    note.id = randomId('n');
    issues.push(issue(path, `${where} had no id; assigned "${note.id}" (written on the next save).`));
  }
  note.content = str(n.content);
  note.title = str(n.title);

  const tags = stringList(n.tags);
  if (!tags.ok) issues.push(issue(path, `${where}: "tags" should be a list of tag ids.`));
  note.tags = tags.list;

  const markers = stringList(n.markers ?? (n.marker ? [n.marker] : undefined));
  if (!markers.ok) issues.push(issue(path, `${where}: "markers" should be a list of marker ids.`));
  note.markers = markers.list;
  delete note.marker;

  if (n.visibility !== undefined && !VISIBILITY.includes(n.visibility)) {
    issues.push(issue(path, `${where}: visibility ${JSON.stringify(n.visibility)} isn't "public" or "private"; treated as public.`));
  }
  note.visibility = n.visibility === 'private' ? 'private' : 'public';

  let type = n.type;
  if (!NOTE_TYPES.includes(type)) {
    if (type !== undefined) issues.push(issue(path, `${where}: unknown type ${JSON.stringify(type)}.`));
    type = n.timestamp != null ? 'timestamp' : 'generic';
  }
  if (type === 'timestamp') {
    const t = parseTime(n.timestamp);
    if (t === null) {
      issues.push(issue(path, `${where} has an invalid timestamp (${JSON.stringify(n.timestamp)}). It's shown as a general note until you fix it.`));
      note.type = 'generic';
      note.timestamp = null;
      note.__originalType = n.type;
      note.__originalTimestamp = n.timestamp;
    } else {
      note.type = 'timestamp';
      note.timestamp = t;
    }
  } else {
    note.type = 'generic';
    note.timestamp = null;
  }
  return note;
}

export function validateVideo(raw, expectedId, path) {
  if (!isObject(raw)) throw new DataError(path, `${path} should contain a single video object.`);
  const issues = [];
  const video = { ...raw };

  if (raw.id !== expectedId) {
    if (raw.id !== undefined) issues.push(issue(path, `id "${raw.id}" doesn't match the file name; using "${expectedId}".`));
    video.id = expectedId;
  }
  if (raw.schemaVersion > SCHEMA_VERSION) issues.push(issue(path, `Written by a newer version (schemaVersion ${raw.schemaVersion}).`));
  video.schemaVersion = SCHEMA_VERSION;

  video.title = str(raw.title).trim();
  if (!video.title) {
    video.title = expectedId;
    issues.push(issue(path, 'has no title.'));
  }
  video.description = str(raw.description);
  if (raw.visibility !== undefined && !VISIBILITY.includes(raw.visibility)) {
    issues.push(issue(path, `visibility ${JSON.stringify(raw.visibility)} isn't "public" or "private"; treated as public.`));
  }
  video.visibility = raw.visibility === 'private' ? 'private' : 'public';

  const s = isObject(raw.sources) ? raw.sources : {};
  const sources = { ...s, local: str(s.local ?? raw.video).trim(), youtube: '', offsetSeconds: 0 };
  delete video.video;
  if (s.youtube) {
    const id = parseYouTubeId(s.youtube);
    if (id) sources.youtube = id;
    else issues.push(issue(path, `sources.youtube (${JSON.stringify(s.youtube)}) isn't a recognizable YouTube link or id.`));
  }
  if (s.offsetSeconds !== undefined) {
    const off = Number(s.offsetSeconds);
    if (Number.isFinite(off)) sources.offsetSeconds = off;
    else issues.push(issue(path, 'sources.offsetSeconds should be a number of seconds.'));
  }
  video.sources = sources;
  if (!sources.local && !sources.youtube) issues.push(issue(path, 'has neither a local file nor a YouTube link, so it cannot play.'));

  const duration = Number(raw.duration);
  if (raw.duration !== undefined && Number.isFinite(duration) && duration > 0) video.duration = duration;
  else delete video.duration;

  const notes = [];
  const quarantine = [];
  if (raw.notes !== undefined && !Array.isArray(raw.notes)) {
    issues.push(issue(path, '"notes" should be an array. It was ignored; editing this video will replace it.', 'error'));
  }
  const seen = new Set();
  (Array.isArray(raw.notes) ? raw.notes : []).forEach((n, i) => {
    const note = normalizeNote(n, i, path, issues);
    if (!note) {
      quarantine.push(n);
      return;
    }
    if (seen.has(note.id)) {
      const fresh = randomId('n');
      issues.push(issue(path, `Duplicate note id "${note.id}"; the later one now uses "${fresh}" (written on the next save).`));
      note.id = fresh;
    }
    seen.add(note.id);
    notes.push(note);
  });
  video.notes = notes;
  video.__quarantine = quarantine;
  return { video, issues };
}
