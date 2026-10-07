// Ordered list of sources to try. Locally the file comes first and the YouTube link is the backup;
// the public site can only use YouTube.
export function resolveSources(video, { isLocal }) {
  const { local, youtube, offsetSeconds } = video.sources || {};
  const list = [];
  if (isLocal && local) list.push({ kind: 'local', label: 'Local file', path: local });
  if (youtube) list.push({ kind: 'youtube', label: 'YouTube', videoId: youtube, offset: Number(offsetSeconds) || 0 });
  return list;
}

export function sourceLabel(kind) {
  return kind === 'local' ? 'Local file' : 'YouTube';
}
