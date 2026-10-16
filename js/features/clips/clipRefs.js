import { plainTitle } from '../../core/markup.js';
import { formatTime } from '../../core/time.js';
import { canStartMention, mentionQuery } from '../video/noteRefs.js';
import { matchVideoRef, videoMentionChoices, videoRefLabel, videoRefTitle } from '../video/videoRefs.js';

// #Opening links a clip. #Highlights links a collection. #Highlights/Opening starts that collection at that clip.
// # already links videos, so a title shared with a video or another clip is written as the id.
// #Name/… is a collection only when that name is a unique collection and not also a video title.

function boundaryAfter(text, length) {
  if (length >= text.length) return true;
  return !/^[\p{L}\p{N}]/u.test(text[length]);
}

function titleOf(item) {
  const title = plainTitle(item?.title);
  if (!title || /[#/\n]/.test(title)) return '';
  return title;
}

function idOf(item) {
  const id = String(item?.id || '').trim();
  if (!id || /[#/\n]/.test(id)) return '';
  return id;
}

function countTitles(items) {
  const counts = new Map();
  for (const item of items || []) {
    const title = titleOf(item);
    if (!title) continue;
    const key = title.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function videoHasTitle(videos, title) {
  const key = String(title || '').toLowerCase();
  return (videos || []).some((video) => titleOf(video).toLowerCase() === key);
}

function keysFor(item, counts) {
  const keys = [];
  const title = titleOf(item);
  if (title && counts.get(title.toLowerCase()) === 1) keys.push({ value: title, kind: 'title' });
  const id = idOf(item);
  if (id) keys.push({ value: id, kind: 'id' });
  return keys;
}

function clipsIn(collection, clips) {
  const byId = new Map((clips || []).map((clip) => [clip.id, clip]));
  const out = [];
  const seen = new Set();
  for (const id of collection?.clipIds || []) {
    const clip = byId.get(id);
    if (!clip || seen.has(clip.id)) continue;
    seen.add(clip.id);
    out.push(clip);
  }
  return out;
}

function matchCollectionSlash(rest, collections, videos) {
  const counts = countTitles(collections);
  let best = null;
  for (const collection of collections || []) {
    const title = titleOf(collection);
    const keys = [];
    if (title && counts.get(title.toLowerCase()) === 1 && !videoHasTitle(videos, title)) keys.push({ value: title, kind: 'title' });
    const id = idOf(collection);
    if (id) keys.push({ value: id, kind: 'id' });
    for (const key of keys) {
      if (rest.length < key.value.length + 1) continue;
      if (rest.slice(0, key.value.length).toLowerCase() !== key.value.toLowerCase()) continue;
      if (rest[key.value.length] !== '/') continue;
      const score = key.value.length * 2 + (key.kind === 'title' ? 1 : 0);
      if (!best || score > best.score) best = { collection, length: key.value.length, key: key.value, score };
    }
  }
  return best;
}

function matchMember(rest, clips) {
  const counts = countTitles(clips);
  let best = null;
  for (const clip of clips || []) {
    for (const key of keysFor(clip, counts)) {
      if (rest.length < key.value.length) continue;
      if (rest.slice(0, key.value.length).toLowerCase() !== key.value.toLowerCase()) continue;
      if (rest[key.value.length] === '/' || !boundaryAfter(rest, key.value.length)) continue;
      const score = key.value.length * 2 + (key.kind === 'title' ? 1 : 0);
      if (!best || score > best.score) best = { item: clip, length: key.value.length, score };
    }
  }
  return best;
}

function matchBare(rest, { videos, clips, collections }) {
  const entries = [
    ...(videos || []).map((item) => ({ item, kind: 'video' })),
    ...(clips || []).map((item) => ({ item, kind: 'clip' })),
    ...(collections || []).map((item) => ({ item, kind: 'collection' })),
  ];
  const counts = countTitles(entries.map((entry) => entry.item));
  let best = null;
  for (const entry of entries) {
    for (const key of keysFor(entry.item, counts)) {
      if (rest.length < key.value.length) continue;
      if (rest.slice(0, key.value.length).toLowerCase() !== key.value.toLowerCase()) continue;
      if (rest[key.value.length] === '/' || !boundaryAfter(rest, key.value.length)) continue;
      const score = key.value.length * 2 + (key.kind === 'title' ? 1 : 0);
      if (!best || score > best.score) best = { ...entry, length: key.value.length, score };
    }
  }
  return best;
}

function videoUsesSharedTitle(match, text, clips, collections) {
  if (!match || match.kind !== 'video' || match.note || match.seconds != null) return false;
  const skip = text.startsWith('#t#') ? 3 : 1;
  const written = text.slice(skip, match.length);
  const title = titleOf(match.video);
  if (!title || written.toLowerCase() !== title.toLowerCase()) return false;
  const key = title.toLowerCase();
  return [...(clips || []), ...(collections || [])].some((item) => titleOf(item).toLowerCase() === key);
}

function bareResult(bare, skip, titleOnly) {
  return {
    length: skip + bare.length,
    kind: bare.kind,
    video: bare.kind === 'video' ? bare.item : null,
    clip: bare.kind === 'clip' ? bare.item : null,
    collection: bare.kind === 'collection' ? bare.item : null,
    note: null,
    seconds: null,
    titleOnly,
  };
}

// text starts at the #. Null means the characters stay as typed.
export function matchHashRef(text, { videos = [], clips = [], collections = [] } = {}) {
  if (!text?.startsWith('#')) return null;
  if (!videos.length && !clips.length && !collections.length) return null;
  const titleOnly = text.startsWith('#t#');
  const skip = titleOnly ? 3 : 1;
  const rest = text.slice(skip);
  const collection = matchCollectionSlash(rest, collections, videos);
  if (collection) {
    const member = matchMember(rest.slice(collection.length + 1), clipsIn(collection.collection, clips));
    if (!member) return null;
    return {
      length: skip + collection.length + 1 + member.length,
      kind: 'collection-clip',
      collection: collection.collection,
      clip: member.item,
      video: null,
      note: null,
      seconds: null,
      titleOnly,
    };
  }
  const bare = matchBare(rest, { videos, clips, collections });
  if (bare) return bareResult(bare, skip, titleOnly);
  const video = matchVideoRef(text, videos);
  if (!video || videoUsesSharedTitle(video, text, clips, collections)) return null;
  return video;
}

export function hashRefLabel(ref) {
  if (ref?.kind === 'collection-clip') {
    const collection = ref.collection?.title || ref.collection?.id || 'Collection';
    const clip = ref.clip?.title || ref.clip?.id || 'Clip';
    return `${collection} / ${clip}`;
  }
  if (ref?.kind === 'collection') return ref.collection?.title || ref.collection?.id || 'Collection';
  if (ref?.kind === 'clip') return ref.clip?.title || ref.clip?.id || 'Clip';
  return videoRefLabel(ref);
}

export function hashRefTitle(ref) {
  if (ref?.kind === 'collection-clip') {
    const clip = plainTitle(ref.clip?.title) || 'this clip';
    const collection = plainTitle(ref.collection?.title) || 'this collection';
    return `Play ${clip} in ${collection}`;
  }
  if (ref?.kind === 'collection') return `Play ${plainTitle(ref.collection?.title) || 'this collection'}`;
  if (ref?.kind === 'clip') return `Play ${plainTitle(ref.clip?.title) || 'this clip'}`;
  return videoRefTitle(ref);
}

function insideUrl(src, index) {
  return /https?:\/\/[^\s<>"]*$/.test(src.slice(0, index));
}

export function displayHashRefs(text, ctx) {
  const src = String(text || '');
  if (!src.includes('#')) return src;
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
    const match = matchHashRef(src.slice(hash), ctx);
    if (!match) {
      out += '#';
      i = hash + 1;
      continue;
    }
    out += hashRefLabel(match);
    i = hash + match.length;
  }
  return out;
}

function clipToken(clip, clips, videos, collections) {
  const counts = countTitles([...(videos || []), ...(clips || []), ...(collections || [])]);
  const keys = keysFor(clip, counts);
  const key = keys.find((item) => item.kind === 'title') || keys[0];
  return key ? `#${key.value}` : null;
}

function collectionToken(collection, collections, videos, clips) {
  const counts = countTitles([...(videos || []), ...(clips || []), ...(collections || [])]);
  const keys = keysFor(collection, counts);
  const key = keys.find((item) => item.kind === 'title') || keys[0];
  return key ? `#${key.value}` : null;
}

function memberToken(collection, clip, collections, videos, clips) {
  const title = titleOf(collection);
  const counts = countTitles(collections);
  const key = title && counts.get(title.toLowerCase()) === 1 && !videoHasTitle(videos, title) ? title : idOf(collection);
  const members = clipsIn(collection, clips);
  const memberCounts = countTitles(members);
  const memberKeys = keysFor(clip, memberCounts);
  const member = memberKeys.find((item) => item.kind === 'title') || memberKeys[0];
  if (!key || !member) return null;
  return `#${key}/${member.value}`;
}

function rankItem(query, title, id) {
  const q = String(query || '').trim().toLowerCase();
  const titleKey = title.toLowerCase();
  const idKey = id.toLowerCase();
  if (!q) return 1;
  if (titleKey === q || idKey === q) return 0;
  if (titleKey.startsWith(q) || idKey.startsWith(q)) return 1;
  if (`${titleKey} ${idKey}`.includes(q)) return 2;
  return -1;
}

function collectionChoices(query, collections, videos, clips) {
  const ranked = [];
  for (const collection of collections || []) {
    const token = collectionToken(collection, collections, videos, clips);
    if (!token) continue;
    const title = plainTitle(collection.title) || collection.id;
    const rank = rankItem(query, title, collection.id);
    if (rank < 0) continue;
    ranked.push({ token, label: collection.title || collection.id, hint: 'Collection', icon: 'list', rank });
  }
  return ranked;
}

function clipChoices(query, clips, videos, collections) {
  const ranked = [];
  for (const clip of clips || []) {
    const token = clipToken(clip, clips, videos, collections);
    if (!token) continue;
    const title = plainTitle(clip.title) || clip.id;
    const rank = rankItem(query, title, clip.id);
    if (rank < 0) continue;
    ranked.push({
      token,
      label: clip.title || clip.id,
      hint: `Clip \u00b7 ${formatTime(clip.start)}\u2013${formatTime(clip.end)}`,
      icon: 'film',
      rank,
    });
  }
  return ranked;
}

export function hashMentionChoices(videos, clips, collections, query) {
  const typed = String(query || '');
  const collection = matchCollectionSlash(typed, collections, videos);
  if (collection) {
    const noteQuery = typed.slice(collection.length + 1);
    const members = clipsIn(collection.collection, clips);
    const items = [];
    for (const clip of members) {
      const token = memberToken(collection.collection, clip, collections, videos, clips);
      if (!token) continue;
      const title = plainTitle(clip.title) || clip.id;
      const rank = rankItem(noteQuery, title, clip.id);
      if (rank < 0) continue;
      items.push({
        token,
        label: clip.title || clip.id,
        hint: 'Clip',
        icon: 'film',
        rank,
      });
    }
    items.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
    return items;
  }
  const items = [
    ...videoMentionChoices(videos, typed).map((item) => ({ ...item, rank: item.rank ?? 1 })),
    ...clipChoices(typed, clips, videos, collections),
    ...collectionChoices(typed, collections, videos, clips),
  ];
  items.sort((a, b) => (a.rank ?? 1) - (b.rank ?? 1) || String(a.label).localeCompare(String(b.label)));
  return items;
}

// True once the caret has moved past a finished # reference and a space.
export function hashMentionClosed(text, cursor, ctx) {
  const found = mentionQuery(text, cursor);
  if (!found || found.sigil !== '#') return false;
  const from = String(text || '').slice(found.start, cursor);
  const match = matchHashRef(from, ctx);
  if (!match || match.length >= from.length) return false;
  if (!/^\s/.test(from.slice(match.length))) return false;
  const typed = from.slice(found.prefixLength);
  return !hashMentionChoices(ctx.videos, ctx.clips, ctx.collections, typed).some((item) => {
    const body = String(item.token || '').replace(/^#t#|^#/, '');
    return body.toLowerCase().startsWith(typed.trim().toLowerCase()) && body.length > typed.trim().length;
  });
}
