const routes = [
  { name: 'library', pattern: /^\/?$/ },
  { name: 'video', pattern: /^\/video\/([^/]+)$/, keys: ['id'] },
  { name: 'search', pattern: /^\/search$/ },
  { name: 'markers', pattern: /^\/markers(?:\/([^/]+))?$/, keys: ['id'] },
];

export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const r of routes) {
    const m = path.match(r.pattern);
    if (!m) continue;
    const params = {};
    (r.keys || []).forEach((k, i) => {
      if (m[i + 1] != null) params[k] = decodeURIComponent(m[i + 1]);
    });
    return { name: r.name, params, query, path };
  }
  return { name: 'notFound', params: {}, query, path };
}

export function href(path, query) {
  const entries = Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  const qs = new URLSearchParams(entries).toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function videoHref(videoId, { t, note } = {}) {
  return href(`/video/${encodeURIComponent(videoId)}`, {
    t: Number.isFinite(t) ? Math.round(t * 10) / 10 : undefined,
    note,
  });
}

export function navigate(path, query, { replace = false } = {}) {
  const target = href(path, query);
  if (target === window.location.hash) return;
  if (replace) {
    history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}

export function startRouter(onRoute) {
  window.addEventListener('hashchange', () => onRoute(parseHash()));
  onRoute(parseHash());
}
