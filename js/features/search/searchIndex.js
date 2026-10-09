import { state, getTag, getMarker, listVideos } from '../../core/store.js';
import { displayTimeTokens, formatTime } from '../../core/time.js';
import { displayNoteRefs } from '../video/noteRefs.js';
import { displayVideoRefs } from '../video/videoRefs.js';
import { passesFilters } from './filters.js';

// Flat in-memory index: one document per video (title, description) and one per note.
// Built from the already visibility-filtered model, so private data never enters it publicly.
const docsByVideo = new Map();

export function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function buildDocs(video) {
  const tagName = (id) => getTag(id)?.name || id;
  const markerName = (id) => getMarker(id)?.name || id;
  const docs = [
    { kind: 'video', type: 'video', videoId: video.id, noteId: null, title: video.title, content: video.description || '', timestamp: null, tagIds: [], markerIds: [], visibility: video.visibility },
  ];
  for (const n of video.notes) {
    docs.push({ kind: 'note', type: n.type, videoId: video.id, noteId: n.id, title: n.title, content: n.content, timestamp: n.timestamp, tagIds: n.tags, markerIds: n.markers, visibility: n.visibility });
  }
  for (const d of docs) {
    d.fields = {
      title: normalize(d.title),
      content: normalize(`${d.content} ${displayTimeTokens(displayVideoRefs(displayNoteRefs(d.content, video.notes), listVideos()))}`),
      labels: normalize([...d.tagIds.map(tagName), ...d.markerIds.map(markerName)].join(' ')),
      time: d.timestamp != null ? formatTime(d.timestamp) : '',
    };
  }
  return docs;
}

export function rebuildIndex(videoId) {
  if (videoId) {
    const v = state.videos.get(videoId);
    if (v) docsByVideo.set(videoId, buildDocs(v));
    else docsByVideo.delete(videoId);
    return;
  }
  docsByVideo.clear();
  for (const v of state.videos.values()) docsByVideo.set(v.id, buildDocs(v));
}

export function queryTerms(q) {
  return normalize(q).split(/\s+/).filter(Boolean);
}

// Every term must match some field. Weights: title 5, tag/marker names 3, exact time 4, content 1.
export function search({ q = '', filters = {} } = {}) {
  const terms = queryTerms(q);
  const results = [];
  for (const docs of docsByVideo.values()) {
    for (const doc of docs) {
      if (!passesFilters(doc, filters)) continue;
      let score = 0;
      let ok = true;
      for (const t of terms) {
        let s = 0;
        if (doc.fields.title.includes(t)) s += 5;
        if (doc.fields.labels.includes(t)) s += 3;
        if (doc.fields.time && doc.fields.time === t) s += 4;
        if (doc.fields.content.includes(t)) s += 1;
        if (!s) {
          ok = false;
          break;
        }
        score += s;
      }
      if (ok) results.push({ doc, score });
    }
  }
  return results;
}

const kindRank = (doc) => (doc.type === 'video' ? 0 : doc.type === 'generic' ? 1 : 2);

export function groupByVideo(results) {
  const order = new Map(state.libraryIds.map((id, i) => [id, i]));
  const groups = new Map();
  for (const r of results) {
    if (!groups.has(r.doc.videoId)) groups.set(r.doc.videoId, { videoId: r.doc.videoId, items: [], best: 0 });
    const g = groups.get(r.doc.videoId);
    g.items.push(r);
    g.best = Math.max(g.best, r.score);
  }
  const list = [...groups.values()].sort((a, b) => b.best - a.best || (order.get(a.videoId) ?? 0) - (order.get(b.videoId) ?? 0));
  for (const g of list) {
    g.items.sort((a, b) => kindRank(a.doc) - kindRank(b.doc) || (a.doc.timestamp ?? 0) - (b.doc.timestamp ?? 0));
  }
  return list;
}
