const ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Accepts watch?v=, youtu.be/, /shorts/, /embed/, /live/, /v/ URLs (with or without &t=) or a bare 11-character id.
export function parseYouTubeId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (ID_RE.test(s)) return s;

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

export function isYouTubeId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

export function youtubeThumbnail(id, quality = 'hqdefault') {
  return `https://i.ytimg.com/vi/${id}/${quality}.jpg`;
}

export function youtubeWatchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}
