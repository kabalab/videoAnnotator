import { plainTitle } from '../../core/markup.js';
import { formatTime, parseTime } from '../../core/time.js';

// @0:25 links the timestamp note at that moment and is shown as its title.
// @Summary links a note by its title. An untitled note can be linked by its first line, or by its id
// when that line is shared or unsafe to write. An @ inside a word (an email) is left alone.
const TIME_TOKEN = /^(\d{1,3}:\d{2}(?::\d{2})?(?:\.\d+)?)/;
const TIME_EXACT = /^\d{1,3}:\d{2}(?::\d{2})?(?:\.\d+)?$/;

function shortLine(text, max = 60) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}\u2026` : s;
}

export function noteRefLabel(note) {
  const title = String(note?.title || '').trim();
  if (title) return title;
  const line = String(note?.content || '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (line) return shortLine(line);
  return note?.type === 'timestamp' && note.timestamp != null ? formatTime(note.timestamp) : 'Note';
}

// Full title and body, for the link menu. Nothing is shortened.
export function noteMentionText(note) {
  const title = String(note?.title || '').trim();
  const body = String(note?.content || '').trim();
  if (title && body) return `${title}\n${body}`;
  if (title || body) return title || body;
  return note?.type === 'timestamp' && note.timestamp != null ? formatTime(note.timestamp) : 'Note';
}

export function canStartMention(prev) {
  if (!prev) return true;
  return !/[\p{L}\p{N}_@#]/u.test(prev);
}

function boundaryAfter(text, length) {
  if (length >= text.length) return true;
  return !/^[\p{L}\p{N}]/u.test(text[length]);
}

function firstLine(note) {
  return String(note?.content || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function clipKey(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s || /[@#\n]/.test(s)) return '';
  return s.length > 80 ? s.slice(0, 80).trimEnd() : s;
}

// Words that can be written after @. A title wins. An untitled note uses its first line.
export function noteTextKeys(note) {
  const rawTitle = plainTitle(note?.title);
  if (rawTitle) {
    const title = clipKey(rawTitle);
    return title ? [title] : [];
  }
  const line = clipKey(firstLine(note));
  return line ? [line] : [];
}

function noteIdKey(note) {
  const id = String(note?.id || '').trim();
  return id && !/[@#/\n]/.test(id) ? id : '';
}

// The note whose displayed clock time is the one the user typed. A titled note wins when several share that second.
export function findTimestampNote(notes, seconds) {
  const target = Math.floor(seconds);
  let best = null;
  let bestScore = Infinity;
  for (const note of notes || []) {
    if (note.type !== 'timestamp' || !Number.isFinite(note.timestamp)) continue;
    if (Math.floor(note.timestamp) !== target) continue;
    const untitled = String(note.title || '').trim() ? 0 : 1;
    const score = untitled * 10 + Math.abs(note.timestamp - seconds);
    if (score < bestScore) {
      best = note;
      bestScore = score;
    }
  }
  return best;
}

function findKeyedNote(notes, rest, keyFor) {
  let best = null;
  let bestLen = 0;
  for (const note of notes || []) {
    const key = keyFor(note);
    if (!key || key.length < bestLen || rest.length < key.length) continue;
    if (rest.slice(0, key.length).toLowerCase() !== key.toLowerCase()) continue;
    if (!boundaryAfter(rest, key.length)) continue;
    if (key.length > bestLen) {
      best = note;
      bestLen = key.length;
    }
  }
  return best ? { note: best, length: bestLen } : null;
}

// The note or clock after a video slash: "#Lecture/Summary" or "#Lecture/0:25".
// allowBareTime keeps a clock even when that video has no note at that moment.
export function matchNoteBody(rest, notes, { allowBareTime = false } = {}) {
  const time = String(rest || '').match(TIME_TOKEN);
  const timeReady = time && boundaryAfter(rest, time[1].length) ? time : null;
  let timeHit = null;
  if (timeReady) {
    const seconds = parseTime(timeReady[1]);
    if (seconds != null) {
      const note = findTimestampNote(notes, seconds);
      if (note) timeHit = { length: timeReady[1].length, note, seconds: note.timestamp, kind: 'time' };
    }
  }
  // A longer title or first line wins over a clock it happens to start with, such as "0:25 recap".
  const titled = findKeyedNote(notes, rest, (note) => noteTextKeys(note)[0] || '');
  if (titled && (!timeHit || titled.length > timeHit.length)) return { length: titled.length, note: titled.note, seconds: null, kind: 'title' };
  if (timeHit) return timeHit;
  const byId = findKeyedNote(notes, rest, noteIdKey);
  if (byId) return { length: byId.length, note: byId.note, seconds: null, kind: 'title' };
  if (allowBareTime && timeReady) {
    const seconds = parseTime(timeReady[1]);
    if (seconds != null) return { length: timeReady[1].length, note: null, seconds, kind: 'time' };
  }
  return null;
}

// text starts at the @. Returns null when nothing on this video matches, so the characters stay as typed.
export function matchNoteRef(text, notes) {
  if (!text?.startsWith('@') || !notes?.length) return null;
  const body = matchNoteBody(text.slice(1), notes);
  if (!body?.note) return null;
  return { length: 1 + body.length, note: body.note, kind: body.kind };
}

// Plain-text form used by search snippets: the title a reader would see, not the @ token.
export function displayNoteRefs(text, notes) {
  const src = String(text || '');
  if (!notes?.length || !src.includes('@')) return src;
  let out = '';
  let i = 0;
  while (i < src.length) {
    const at = src.indexOf('@', i);
    if (at < 0) return out + src.slice(i);
    const stuckToWord = !canStartMention(at > 0 ? src[at - 1] : '');
    if (stuckToWord) {
      out += src.slice(i, at + 1);
      i = at + 1;
      continue;
    }
    out += src.slice(i, at);
    const match = matchNoteRef(src.slice(at), notes);
    if (!match) {
      out += '@';
      i = at + 1;
      continue;
    }
    out += noteRefLabel(match.note);
    i = at + match.length;
  }
  return out;
}

function textKeyTaken(key, note, notes) {
  const lower = key.toLowerCase();
  if (TIME_EXACT.test(key)) {
    const seconds = parseTime(key);
    const owner = seconds == null ? null : findTimestampNote(notes, seconds);
    if (owner && owner.id !== note.id) return true;
  }
  return (notes || []).some((other) => {
    if (!other || other.id === note.id) return false;
    const otherKey = noteTextKeys(other)[0];
    return !!otherKey && otherKey.toLowerCase() === lower;
  });
}

// What gets written after @. A timestamp that owns its second stays @m:ss, so renaming it still resolves.
// Anything else uses its title or first line. A shared or unsafe name falls back to the note id.
export function mentionToken(note, notes) {
  if (note?.type === 'timestamp' && note.timestamp != null) {
    const winner = findTimestampNote(notes, Math.floor(note.timestamp));
    if (winner?.id === note.id) return `@${formatTime(note.timestamp)}`;
  }
  const key = noteTextKeys(note)[0];
  if (key && !textKeyTaken(key, note, notes)) return `@${key}`;
  const id = noteIdKey(note);
  return id ? `@${id}` : null;
}

// The @ or # being typed, if the caret is inside one. start is the index of that sigil.
export function mentionQuery(text, cursor) {
  const upto = String(text || '').slice(0, Number.isFinite(cursor) ? cursor : 0);
  const m = upto.match(/(?:^|[\s([(])([@#])([^@#\n]*)$/);
  if (!m) return null;
  return { sigil: m[1], query: m[2], start: upto.length - m[2].length - 1 };
}

// True once the caret has moved past a finished reference, such as "@Summary " or "@0:25 and then".
// A space that is still part of a longer title ("@Trap " while "Trap montage" exists) stays open.
export function mentionClosed(text, cursor, notes) {
  const found = mentionQuery(text, cursor);
  if (!found || found.sigil !== '@') return false;
  const fromAt = String(text || '').slice(found.start, cursor);
  const match = matchNoteRef(fromAt, notes);
  if (!match || match.length >= fromAt.length) return false;
  if (!/^\s/.test(fromAt.slice(match.length))) return false;
  const typed = fromAt.slice(1).toLowerCase();
  const longer = (notes || []).some((note) =>
    [noteTextKeys(note)[0], noteIdKey(note), note?.type === 'timestamp' && note.timestamp != null ? formatTime(note.timestamp) : ''].some((key) => {
      const value = String(key || '').toLowerCase();
      return value.startsWith(typed) && value.length > typed.length;
    }),
  );
  return !longer;
}

export function mentionChoices(notes, query) {
  const q = String(query || '').trim().toLowerCase();
  const seen = new Set();
  const ranked = [];
  for (const note of notes || []) {
    const token = mentionToken(note, notes);
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    const title = plainTitle(note.title);
    const time = note.type === 'timestamp' && note.timestamp != null ? formatTime(note.timestamp) : '';
    const label = noteMentionText(note);
    const hay = `${plainTitle(label)} ${time}`.toLowerCase();
    let rank = 50;
    if (q) {
      const titleKey = title.toLowerCase();
      const timeKey = time.toLowerCase();
      if (timeKey === q || titleKey === q) rank = 0;
      else if (timeKey.startsWith(q) || titleKey.startsWith(q)) rank = 1;
      else if (hay.includes(q)) rank = 2;
      else continue;
    }
    seen.add(key);
    ranked.push({
      note,
      token,
      label,
      time,
      rank,
      order: note.type === 'timestamp' ? note.timestamp ?? 0 : 0,
    });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order || a.label.localeCompare(b.label));
  if (q) return ranked;
  const times = ranked.filter((item) => item.time);
  const general = ranked.filter((item) => !item.time);
  return [...times, ...general];
}
