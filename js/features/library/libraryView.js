import { config } from '../../config.js';
import { fill, formattedText, h, hashHue, plural, snippet } from '../../core/dom.js';
import { plainMarkup, plainTitle } from '../../core/markup.js';
import { store, state, canEdit, showPrivate, editorActive, getVideoFolder } from '../../core/store.js';
import { href, navigate, videoHref } from '../../core/router.js';
import * as repo from '../../data/repository.js';
import { formatDuration } from '../../core/time.js';
import { icon } from '../../ui/icons.js';
import { confirmDanger } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { privateBadge } from '../descriptors/chips.js';
import { youtubeThumbnail } from './youtubeUrl.js';
import { openAddVideoDialog } from './addVideoDialog.js';
import { openFolderDialog } from './folderDialog.js';

export function videoThumb(video, { quality = 'hqdefault', className = 'thumb' } = {}) {
  const yt = video.sources?.youtube;
  return h(
    'div',
    { class: className, style: { '--hue': hashHue(video.id) } },
    h('span', { class: 'thumb-initial', 'aria-hidden': 'true' }, (plainTitle(video.title) || video.title).trim().charAt(0).toUpperCase()),
    yt && h('img', { src: youtubeThumbnail(yt, quality), alt: '', loading: 'lazy', decoding: 'async', onerror: (e) => e.target.remove() }),
  );
}

function videoTile(video) {
  const timestamps = video.notes.filter((n) => n.type === 'timestamp').length;
  const general = video.notes.length - timestamps;
  const badges = [];
  if (showPrivate() && video.visibility === 'private') badges.push(privateBadge('Private video'));
  if (showPrivate() && !video.sources.youtube) {
    badges.push(h('span', { class: 'badge badge-warning', title: 'Add a backup YouTube link to show this video on the public site' }, icon('youtube'), 'No backup link: hidden on the public site'));
  }
  return h(
    'a',
    { class: 'tile', href: videoHref(video.id) },
    h(
      'div',
      { class: 'tile-media' },
      videoThumb(video),
      h('span', { class: 'tile-play', 'aria-hidden': 'true' }, icon('play')),
      video.duration && h('span', { class: 'tile-duration' }, formatDuration(video.duration)),
    ),
    h(
      'div',
      { class: 'tile-body' },
      h('h3', { class: 'tile-title' }, formattedText(video.title)),
      h('p', { class: 'tile-meta' }, [timestamps && plural(timestamps, 'timestamp'), general && plural(general, 'note')].filter(Boolean).join(' \u00b7 ') || 'No notes yet'),
      badges.length ? h('div', { class: 'tile-badges' }, badges) : null,
    ),
  );
}

function errorTile(id, err) {
  return h(
    'div',
    { class: 'tile tile-error', role: 'note' },
    h('div', { class: 'tile-media' }, h('div', { class: 'thumb thumb-error' }, icon('warning'))),
    h('div', { class: 'tile-body' }, h('h3', { class: 'tile-title' }, id), h('p', { class: 'tile-meta' }, `Couldn\u2019t load ${err.path}: ${err.message}`)),
  );
}

function folderVideoEntries(folder) {
  return (folder.videoIds || [])
    .map((id) => ({ id, video: state.videos.get(id), error: state.videoErrors.get(id) }))
    .filter((entry) => entry.video || (showPrivate() && (entry.error || canEdit())));
}

function childMap() {
  const folders = state.libraryFolders || [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const children = new Map(folders.map((folder) => [folder.id, []]));
  const reaches = (from, target, seen) => {
    if (from === target) return true;
    if (!from || seen.has(from)) return false;
    seen.add(from);
    for (const child of children.get(from) || []) {
      if (reaches(child.id, target, seen)) return true;
    }
    return false;
  };
  for (const folder of folders) {
    for (const childId of folder.folderIds || []) {
      const child = byId.get(childId);
      if (!child || child.id === folder.id) continue;
      if ((children.get(folder.id) || []).some((item) => item.id === child.id)) continue;
      if (reaches(child.id, folder.id, new Set())) continue;
      children.get(folder.id).push(child);
    }
  }
  return children;
}

function folderHasVisibleVideo(folder, tree, seen = new Set()) {
  if (!folder || seen.has(folder.id)) return false;
  seen.add(folder.id);
  if (folderVideoEntries(folder).some((entry) => entry.video)) return true;
  return (tree.get(folder.id) || []).some((child) => folderHasVisibleVideo(child, tree, seen));
}

function visibleFolder(folder, tree) {
  return !!(folder && (showPrivate() || folderHasVisibleVideo(folder, tree)));
}

function visibleChildFolders(folder, tree) {
  return (tree.get(folder.id) || []).filter((child) => visibleFolder(child, tree));
}

function rootFolders(tree) {
  const nested = new Set();
  for (const folder of state.libraryFolders || []) {
    if (!visibleFolder(folder, tree)) continue;
    for (const child of visibleChildFolders(folder, tree)) nested.add(child.id);
  }
  return (state.libraryFolders || []).filter((folder) => visibleFolder(folder, tree) && !nested.has(folder.id));
}

function parentFolders(folder, tree) {
  return (state.libraryFolders || []).filter(
    (item) => visibleFolder(item, tree) && (tree.get(item.id) || []).some((child) => child.id === folder.id),
  );
}

function libraryEntries() {
  return state.libraryIds
    .map((id) => ({ id, video: state.videos.get(id), error: state.videoErrors.get(id) }))
    .filter((entry) => entry.video || entry.error);
}

function looseEntries() {
  const filed = new Set();
  for (const folder of state.libraryFolders || []) {
    for (const id of folder.videoIds || []) filed.add(id);
  }
  return libraryEntries().filter((entry) => !filed.has(entry.id));
}

function allEntries() {
  const entries = libraryEntries();
  const seen = new Set(entries.map((entry) => entry.id));
  for (const folder of state.libraryFolders || []) {
    for (const entry of folderVideoEntries(folder)) {
      if (seen.has(entry.id) || !(entry.video || entry.error)) continue;
      seen.add(entry.id);
      entries.push(entry);
    }
  }
  return entries;
}

function entryTile(entry) {
  return entry.video ? videoTile(entry.video) : errorTile(entry.id, entry.error || { path: entry.id, message: 'This video is not in the library.' });
}

function folderTile(folder, tree) {
  const count = folderVideoEntries(folder).filter((entry) => entry.video || entry.error).length;
  const nested = visibleChildFolders(folder, tree).length;
  const meta = [nested ? plural(nested, 'folder') : '', count || !nested ? plural(count, 'video') : ''].filter(Boolean).join(' \u00b7 ');
  const description = snippet(plainMarkup(folder.description), 140);
  return h(
    'a',
    { class: 'tile', href: `#/folder/${encodeURIComponent(folder.id)}` },
    h(
      'div',
      { class: 'tile-media' },
      h('div', { class: 'thumb thumb-folder', style: { '--hue': hashHue(folder.id) } }, icon('folder', 'thumb-folder-icon')),
    ),
    h(
      'div',
      { class: 'tile-body' },
      h('h3', { class: 'tile-title' }, formattedText(folder.title)),
      description && h('p', { class: 'tile-desc' }, description),
      h('p', { class: 'tile-meta' }, meta),
    ),
  );
}

function videoGrid(entries) {
  return h('div', { class: 'tile-grid' }, entries.map(entryTile));
}

export function mountLibraryView(container, route) {
  let current = route;
  const root = h('div', { class: 'page library-page' });
  container.append(root);

  function renderLibrary(tree) {
    const viewingAll = current.query?.all === '1';
    const folders = rootFolders(tree);
    const everyEntry = allEntries();
    const entries = viewingAll ? everyEntry : looseEntries();
    const videoCount = everyEntry.filter((entry) => entry.video).length;
    const editing = canEdit();
    document.title = viewingAll ? 'All videos \u00b7 Video Annotator' : 'Library \u00b7 Video Annotator';

    const actions = [
      folders.length &&
        (viewingAll
          ? h('a', { class: 'btn btn-secondary', href: '#/' }, icon('folder'), 'View folders')
          : h('a', { class: 'btn btn-secondary', href: href('/', { all: '1' }) }, icon('grid'), 'View all')),
      editing && h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => openFolderDialog() }, icon('plus'), 'New folder'),
      editing && h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openAddVideoDialog() }, icon('plus'), 'Add video'),
    ].filter(Boolean);

    const header = h(
      'header',
      { class: 'page-header' },
      h('div', {}, h('h1', { class: 'page-title' }, viewingAll ? 'All videos' : 'Library'), h('p', { class: 'page-sub' }, videoCount ? plural(videoCount, 'video') : '')),
      actions.length ? h('div', { class: 'clips-header-actions' }, actions) : null,
    );

    const showFolders = !viewingAll && folders.length;
    const folderSection = showFolders
      ? h(
          'section',
          { class: entries.length ? 'gallery-section' : '' },
          entries.length ? h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Folders')) : null,
          h('div', { class: 'tile-grid' }, folders.map((folder) => folderTile(folder, tree))),
        )
      : null;

    const videoSection = entries.length
      ? h(
          'section',
          { class: showFolders ? 'gallery-section' : '' },
          showFolders ? h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Videos')) : null,
          videoGrid(entries),
        )
      : !showFolders
        ? h(
            'div',
            { class: 'empty-state' },
            icon('film', 'empty-icon'),
            h('h2', {}, editorActive() ? 'Your library is empty' : 'No videos yet'),
            h('p', {}, editorActive() ? 'Add a video from a file in the videos folder or from a YouTube link.' : 'Check back later.'),
            editing && h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openAddVideoDialog() }, icon('plus'), 'Add video'),
          )
        : null;

    const unregistered = editing && state.unregistered.length
      ? h(
          'section',
          { class: 'library-section' },
          h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Videos not in the library yet'), h('span', { class: 'muted' }, 'Found in your videos folder')),
          h(
            'ul',
            { class: 'file-list' },
            state.unregistered.map((f) =>
              h(
                'li',
                { class: 'file-row' },
                icon('film'),
                h('span', { class: 'file-name' }, f.name),
                h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => openAddVideoDialog({ local: `videos/${f.name}` }) }, icon('plus'), 'Add to library'),
              ),
            ),
          ),
        )
      : null;

    fill(root, header, folderSection, videoSection, unregistered);
  }

  async function removeFolder(folder, tree) {
    const ok = await confirmDanger({
      title: 'Delete folder',
      message: `Delete "${plainTitle(folder.title) || folder.title}"?`,
      detail: 'Videos and folders inside it stay in the library.',
      confirmLabel: 'Delete folder',
    });
    if (!ok) return;
    const parents = parentFolders(folder, tree);
    const result = await repo.deleteVideoFolder(folder.id);
    if (!result) return;
    toast('Folder deleted', {
      duration: config.undoMs,
      action: {
        label: 'Undo',
        fn: () => {
          repo.restoreVideoFolder(result.folder, result.parentIds).catch((e) => toast(e.message, { kind: 'error' }));
        },
      },
    });
    navigate(parents.length === 1 ? `/folder/${encodeURIComponent(parents[0].id)}` : '/');
  }

  function renderFolder(tree) {
    const folder = getVideoFolder(current.params.id);
    const editing = canEdit();
    if (!folder || !visibleFolder(folder, tree)) {
      document.title = 'Folder \u00b7 Video Annotator';
      fill(
        root,
        h(
          'div',
          { class: 'empty-state' },
          icon('folder', 'empty-icon'),
          h('h2', {}, 'That folder isn\u2019t available'),
          h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to the library'),
        ),
      );
      return;
    }
    document.title = `${plainTitle(folder.title) || folder.title} \u00b7 Library`;
    const entries = folderVideoEntries(folder).filter((entry) => entry.video || entry.error || editing);
    const nested = visibleChildFolders(folder, tree);
    const parents = parentFolders(folder, tree);
    const back = parents.length === 1 ? { href: `#/folder/${encodeURIComponent(parents[0].id)}`, label: plainTitle(parents[0].title) || parents[0].title } : { href: '#/', label: 'Library' };
    const videoCount = entries.filter((entry) => entry.video || entry.error).length;
    const summary = [nested.length ? plural(nested.length, 'folder') : '', videoCount || !nested.length ? plural(videoCount, 'video') : ''].filter(Boolean).join(' \u00b7 ');
    const header = h(
      'header',
      { class: 'page-header' },
      h(
        'div',
        {},
        h('a', { class: 'folder-back', href: back.href }, icon('back'), back.label),
        h('h1', { class: 'page-title' }, formattedText(folder.title)),
        h('p', { class: 'page-sub' }, summary),
      ),
      editing &&
        h(
          'div',
          { class: 'clips-header-actions' },
          h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => openFolderDialog(null, { parentId: folder.id }) }, icon('plus'), 'New folder'),
          h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => openFolderDialog(folder) }, icon('edit'), 'Edit'),
          h(
            'button',
            {
              class: 'btn btn-ghost btn-danger-text',
              type: 'button',
              onclick: () => removeFolder(folder, tree).catch((e) => toast(e.message, { kind: 'error' })),
            },
            icon('trash'),
            'Delete',
          ),
        ),
    );
    const description = folder.description
      ? h('div', { class: 'folder-copy' }, formattedText(folder.description))
      : null;
    const showBoth = nested.length && entries.length;
    const folderSection = nested.length
      ? h(
          'section',
          { class: showBoth ? 'gallery-section' : '' },
          showBoth ? h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Folders')) : null,
          h('div', { class: 'tile-grid' }, nested.map((child) => folderTile(child, tree))),
        )
      : null;
    const videoSection = entries.length
      ? h(
          'section',
          { class: showBoth ? 'gallery-section' : '' },
          showBoth ? h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Videos')) : null,
          videoGrid(entries),
        )
      : null;
    const empty = folderSection || videoSection
      ? null
      : h('div', { class: 'empty-state' }, icon('film', 'empty-icon'), h('h2', {}, 'This folder is empty'), h('p', {}, editing ? 'Edit the folder to add videos, or create a folder inside it.' : 'Nothing is in this folder yet.'));
    fill(root, header, description, folderSection, videoSection, empty);
  }

  function render() {
    const tree = childMap();
    if (current?.name === 'folder') renderFolder(tree);
    else renderLibrary(tree);
  }

  const offs = ['data', 'descriptors', 'mode', 'unregistered'].map((e) => store.on(e, render));
  render();
  return {
    update(next) {
      current = next;
      render();
    },
    destroy: () => offs.forEach((off) => off()),
  };
}
