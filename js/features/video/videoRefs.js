import { formatTime, parseTime } from '../../core/time.js';
import { canStartMention, matchNoteBody, mentionChoices, mentionQuery, noteRefLabel, noteTextKeys } from './noteRefs.js';

// #Lecture links that video. #Lecture/Summary links a note by title.
// #Lecture/0:25 links the note at that time, or the moment itself when no note is there.
// A # stuck to a word is left alone. Titles that are shared by two videos are written as the id.

const CLOCK_TOKEN = /^\d{1,3}:\d{2}(?::\d{2})?(?:\.\d+)?$/;

function boundaryAfter(text, length) {
  if (length >= text.length) return true;
  return !/^[\p{L}\p{N}]/u.test(text[length]);
}

function titleCounts(videos) {
  const counts = new Map();
  for (const video of videos || []) {
    const title = String(video?.title || '').trim();
    if (!title || /[#\n]/.test(title)) continue;
    const key = title.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function videoRefKeys(video, counts) {
  const keys = [];
  const title = String(video?.title || '').trim();
  if (title && !/[#\n]/.test(title) && counts.get(title.toLowerCase()) === 1) keys.push({ value: title, kind: 'title' });
  const id = String(video?.id || '').trim();
  if (id && !/[#/\n]/.test(id)) keys.push({ value: id, kind: 'id' });
  return keys;
}

function bestKey(rest, videos, counts, { requireSlash = false } = {}) {
  let best = null;
  for (const video of videos || []) {
    for (const key of videoRefKeys(video, counts)) {
      if (rest.length < key.value.length) continue;
      if (rest.slice(0, key.value.length).toLowerCase() !== key.value.toLowerCase()) continue;
      const next = rest[key.value.length];
      if (requireSlash) {
        if (next !== '/') continue;
      } else if (next && next !== '/' && !boundaryAfter(rest, key.value.length)) continue;
      const score = key.value.length * 2 + (key.kind === 'title' ? 1 : 0);
      if (!best || score > best.score) best = { video, key, length: key.value.length, score };
    }
  }
  return best;
}

export function videoMentionToken(video, videos) {
  const keys = videoRefKeys(video, titleCounts(videos));
  const key = keys.find((item) => item.kind === 'title') || keys[0];
  return key ? `#${key.value}` : null;
}

// text starts at the #. Returns null when no video matches, so the characters stay as typed.
export function matchVideoRef(text, videos) {
  if (!text?.startsWith('#') || !videos?.length) return null;
  const rest = text.slice(1);
  const counts = titleCounts(videos);
  const best = bestKey(rest, videos, counts);
  if (!best) return null;
  const after = rest.slice(best.length);
  if (!after.startsWith('/')) {
    if (!boundaryAfter(rest, best.length)) return null;
    return { length: 1 + best.length, video: best.video, note: null, seconds: null, kind: 'video' };
  }
  const body = matchNoteBody(after.slice(1), best.video.notes, { allowBareTime: true });
  if (!body) return null;
  return {
    length: 1 + best.length + 1 + body.length,
    video: best.video,
    note: body.note,
    seconds: body.note?.type === 'timestamp' && body.note.timestamp != null ? body.note.timestamp : body.seconds,
    kind: body.kind,
  };
}

export function videoRefLabel(ref) {
  const name = ref.video?.title || ref.video?.id || 'Video';
  if (ref.note) return `${name} / ${noteRefLabel(ref.note)}`;
  if (ref.kind === 'time' && ref.seconds != null) return `${name} / ${formatTime(ref.seconds)}`;
  return name;
}

export function videoRefTitle(ref) {
  const name = ref.video?.title || ref.video?.id || 'this video';
  if (ref.note?.type === 'timestamp' && ref.note.timestamp != null) return `Jump to ${formatTime(ref.note.timestamp)} in ${name}`;
  if (ref.note) return `Show this note in ${name}`;
  if (ref.seconds != null) return `Jump to ${formatTime(ref.seconds)} in ${name}`;
  return `Open ${name}`;
}

function insideUrl(src, index) {
  return /https?:\/\/[^\s<>"]*$/.test(src.slice(0, index));
}

export function displayVideoRefs(text, videos) {
  const src = String(text || '');
  if (!videos?.length || !src.includes('#')) return src;
  let out = '';
  let i = 0;
  while (i < src.length) {
    const hash = src.indexOf('#', i);
    if (hash < 0) return out + src.slice(i);
    const blocked = insideUrl(src, hash) || !canStartMention(hash > 0 ? src[hash - 1] : '');
    if (blocked) {
      out += src.slice(i, hash + 1);
      i = hash + 1;
      continue;
    }
    out += src.slice(i, hash);
    const match = matchVideoRef(src.slice(hash), videos);
    if (!match) {
      out += '#';
      i = hash + 1;
      continue;
    }
    out += videoRefLabel(match);
    i = hash + match.length;
  }
  return out;
}

// The video whose name is complete and followed by /, while the user is picking a note.
function videoForNoteQuery(videos, query) {
  const counts = titleCounts(videos);
  const best = bestKey(query, videos, counts, { requireSlash: true });
  if (!best) return null;
  return { video: best.video, key: best.key.value, noteQuery: query.slice(best.length + 1) };
}

export function videoMentionChoices(videos, query) {
  const typed = String(query || '');
  const target = videoForNoteQuery(videos, typed);
  if (target) {
    const items = mentionChoices(target.video.notes, target.noteQuery).map((item) => ({
      token: `#${target.key}/${item.token.slice(1)}`,
      label: item.label,
      hint: item.time || 'General',
      icon: item.time ? 'clock' : 'note',
    }));
    const clock = target.noteQuery.trim();
    if (CLOCK_TOKEN.test(clock)) {
      const seconds = parseTime(clock);
      if (seconds != null) {
        const token = `#${target.key}/${formatTime(seconds)}`;
        if (!items.some((item) => item.token.toLowerCase() === token.toLowerCase())) {
          items.unshift({ token, label: formatTime(seconds), hint: 'Jump', icon: 'clock' });
        }
      }
    }
    return items.slice(0, 30);
  }

  const q = typed.trim().toLowerCase();
  const counts = titleCounts(videos);
  const ranked = [];
  for (const video of videos || []) {
    const token = videoMentionToken(video, videos);
    if (!token) continue;
    const title = String(video.title || '').trim();
    const id = String(video.id || '');
    const titleKey = title.toLowerCase();
    const idKey = id.toLowerCase();
    const hay = `${titleKey} ${idKey}`;
    let rank = 1;
    if (q) {
      if (titleKey === q || idKey === q) rank = 0;
      else if (titleKey.startsWith(q) || idKey.startsWith(q)) rank = 1;
      else if (hay.includes(q)) rank = 2;
      else continue;
    }
    const ambiguous = counts.get(titleKey) > 1;
    ranked.push({
      token,
      label: title || id,
      hint: ambiguous ? id : 'Video',
      icon: 'film',
      rank,
    });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
  return ranked.slice(0, 30);
}

// True once the caret has moved past a finished # reference and a space.
export function videoMentionClosed(text, cursor, videos) {
  const found = mentionQuery(text, cursor);
  if (!found || found.sigil !== '#') return false;
  const from = String(text || '').slice(found.start, cursor);
  const match = matchVideoRef(from, videos);
  if (!match || match.length >= from.length) return false;
  if (!/^\s/.test(from.slice(match.length))) return false;
  const typed = from.slice(1).toLowerCase();
  const counts = titleCounts(videos);
  if (!match.note && match.kind === 'video') {
    const longer = (videos || []).some((video) =>
      videoRefKeys(video, counts).some((key) => {
        const value = key.value.toLowerCase();
        return value.startsWith(typed) && value.length > typed.length;
      }),
    );
    return !longer;
  }
  const videoKey = bestKey(from.slice(1), videos, counts);
  const noteTyped = videoKey ? from.slice(1 + videoKey.length + 1).toLowerCase() : '';
  const longerNote = (match.video.notes || []).some((note) => {
    const id = String(note?.id || '').trim();
    const keys = [...noteTextKeys(note), id && !/[@#/\n]/.test(id) ? id : ''];
    return keys.some((key) => {
      const value = String(key || '').toLowerCase();
      return value.startsWith(noteTyped) && value.length > noteTyped.length;
    });
  });
  return !longerNote;
}
