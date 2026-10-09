import { formatTime, parseTime } from '../../core/time.js';

// @0:25 links the timestamp note at that moment and is shown as its title.
// @Summary links whichever note has that title. An @ inside a word (an email) is left alone.
const TIME_TOKEN = /^(\d{1,3}:\d{2}(?::\d{2})?(?:\.\d+)?)/;

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

export function canStartMention(prev) {
  if (!prev) return true;
  return !/[\p{L}\p{N}_@]/u.test(prev);
}

function boundaryAfter(text, length) {
  if (length >= text.length) return true;
  return !/^[\p{L}\p{N}]/u.test(text[length]);
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

function findTitleNote(notes, rest) {
  let best = null;
  let bestLen = 0;
  for (const note of notes || []) {
    const title = String(note.title || '').trim();
    if (!title || title.length < bestLen || rest.length < title.length) continue;
    if (rest.slice(0, title.length).toLowerCase() !== title.toLowerCase()) continue;
    if (!boundaryAfter(rest, title.length)) continue;
    if (title.length > bestLen) {
      best = note;
      bestLen = title.length;
    }
  }
  return best ? { note: best, length: bestLen } : null;
}

// text starts at the @. Returns null when nothing on this video matches, so the characters stay as typed.
export function matchNoteRef(text, notes) {
  if (!text?.startsWith('@') || !notes?.length) return null;
  const rest = text.slice(1);
  const time = rest.match(TIME_TOKEN);
  if (time) {
    const seconds = parseTime(time[1]);
    if (seconds != null) {
      const note = findTimestampNote(notes, seconds);
      if (note) return { length: 1 + time[1].length, note, kind: 'time' };
    }
  }
  const titled = findTitleNote(notes, rest);
  if (!titled) return null;
  return { length: 1 + titled.length, note: titled.note, kind: 'title' };
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

// What gets written into the description. Times stay as @m:ss so renaming the note still resolves.
export function mentionToken(note, notes) {
  if (note?.type === 'timestamp' && note.timestamp != null) {
    const winner = findTimestampNote(notes, Math.floor(note.timestamp));
    if (winner?.id === note.id) return `@${formatTime(note.timestamp)}`;
  }
  const title = String(note?.title || '').trim();
  return title ? `@${title}` : null;
}

// The @ being typed, if the caret is inside one. start is the index of that @.
export function mentionQuery(text, cursor) {
  const upto = String(text || '').slice(0, Number.isFinite(cursor) ? cursor : 0);
  const m = upto.match(/(?:^|[\s([(])@([^@\n]*)$/);
  if (!m) return null;
  return { query: m[1], start: upto.length - m[1].length - 1 };
}

// True once the caret has moved past a finished reference, such as "@Summary " or "@0:25 and then".
// A space that is still part of a longer title ("@Trap " while "Trap montage" exists) stays open.
export function mentionClosed(text, cursor, notes) {
  const found = mentionQuery(text, cursor);
  if (!found) return false;
  const fromAt = String(text || '').slice(found.start, cursor);
  const match = matchNoteRef(fromAt, notes);
  if (!match || match.length >= fromAt.length) return false;
  if (!/^\s/.test(fromAt.slice(match.length))) return false;
  const typed = fromAt.slice(1).toLowerCase();
  const longerTitle = (notes || []).some((note) => {
    const title = String(note.title || '').trim().toLowerCase();
    return title.startsWith(typed) && title.length > typed.length;
  });
  return !longerTitle;
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
    const title = String(note.title || '').trim();
    const time = note.type === 'timestamp' && note.timestamp != null ? formatTime(note.timestamp) : '';
    const label = noteRefLabel(note);
    const hay = `${title} ${time} ${label}`.toLowerCase();
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
    ranked.push({ note, token, label, time, rank, order: note.type === 'timestamp' ? note.timestamp : 1e9 });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order || a.label.localeCompare(b.label));
  return ranked.slice(0, 12);
}
