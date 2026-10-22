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

function visibleGroups(groups, ids) {
  return (groups || [])
    .map((group) => ({ ...group, clipIds: (group.clipIds || []).filter((id) => ids.has(id)) }))
    .filter((group) => group.clipIds.length);
}

// Public visitors only see clips whose source video is visible, and groups that still have one of those clips.
export function applyClipVisibility(model, videos, showPrivate) {
  const clips = model?.clips || [];
  const collections = model?.collections || [];
  const folders = model?.folders || [];
  if (showPrivate) return model;
  const visible = new Set((videos || []).map((video) => video?.id).filter(Boolean));
  const shown = clips.filter((clip) => visible.has(clip.videoId));
  const ids = new Set(shown.map((clip) => clip.id));
  return {
    ...model,
    clips: shown,
    collections: visibleGroups(collections, ids),
    folders: visibleGroups(folders, ids),
    __quarantine: { clips: [], collections: [], folders: [] },
  };
}
