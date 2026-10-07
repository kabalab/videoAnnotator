// The single place that decides what public visitors can see. repository.loadAll() runs every video
// through applyVisibility(), so nothing downstream (UI, search, markers, seek-bar ticks) ever receives
// private data in PUBLIC mode. This hides content; it does not secure it. The JSON files stay downloadable.

export function isPublic(item) {
  return (item?.visibility ?? 'public') !== 'private';
}

export function applyVisibility(video, showPrivate) {
  if (showPrivate) return video;
  if (!isPublic(video)) return null;
  // The public site can't play local files, so a video with no YouTube link is hidden there.
  if (!video.sources?.youtube) return null;
  return { ...video, notes: video.notes.filter(isPublic), __quarantine: [] };
}
