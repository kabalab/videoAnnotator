import { fill, h, hashHue, plural } from '../../core/dom.js';
import { store, state, canEdit, showPrivate, sortedMarkers } from '../../core/store.js';
import { videoHref, href } from '../../core/router.js';
import { formatDuration } from '../../core/time.js';
import { usageCounts } from '../../data/repository.js';
import { icon } from '../../ui/icons.js';
import { markerChip, privateBadge } from '../descriptors/chips.js';
import { youtubeThumbnail } from './youtubeUrl.js';
import { openAddVideoDialog } from './addVideoDialog.js';

export function videoThumb(video, { quality = 'hqdefault', className = 'thumb' } = {}) {
  const yt = video.sources?.youtube;
  return h(
    'div',
    { class: className, style: { '--hue': hashHue(video.id) } },
    h('span', { class: 'thumb-initial', 'aria-hidden': 'true' }, video.title.trim().charAt(0).toUpperCase()),
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
      h('h3', { class: 'tile-title' }, video.title),
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

export function mountLibraryView(container) {
  document.title = 'Library \u00b7 Video Annotator';
  const root = h('div', { class: 'page library-page' });
  container.append(root);

  function render() {
    const entries = state.libraryIds.map((id) => ({ id, video: state.videos.get(id), error: state.videoErrors.get(id) })).filter((e) => e.video || e.error);
    const videoCount = entries.filter((e) => e.video).length;
    const editing = canEdit();

    const header = h(
      'header',
      { class: 'page-header' },
      h('div', {}, h('h1', { class: 'page-title' }, 'Library'), h('p', { class: 'page-sub' }, videoCount ? plural(videoCount, 'video') : '')),
      editing && h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openAddVideoDialog() }, icon('plus'), 'Add video'),
    );

    const grid = entries.length
      ? h('div', { class: 'tile-grid' }, entries.map((e) => (e.video ? videoTile(e.video) : errorTile(e.id, e.error))))
      : h(
          'div',
          { class: 'empty-state' },
          icon('film', 'empty-icon'),
          h('h2', {}, state.env.isLocal ? 'Your library is empty' : 'No videos yet'),
          h('p', {}, state.env.isLocal ? 'Add a video from a file in the videos folder or from a YouTube link.' : 'Check back later.'),
          editing && h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openAddVideoDialog() }, icon('plus'), 'Add video'),
        );

    const counts = usageCounts('marker');
    const markers = sortedMarkers().filter((m) => counts.get(m.id));
    const markerRow = markers.length
      ? h(
          'section',
          { class: 'library-section' },
          h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Browse by marker'), h('a', { class: 'section-link', href: href('/markers') }, 'All markers', icon('chevronRight'))),
          h('div', { class: 'chips chips-lg' }, markers.map((m) => markerChip(m.id, { href: href(`/markers/${encodeURIComponent(m.id)}`), count: counts.get(m.id) }))),
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
                f.location === 'external' && h('span', { class: 'badge' }, 'External folder'),
                h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => openAddVideoDialog({ local: `videos/${f.name}` }) }, icon('plus'), 'Add to library'),
              ),
            ),
          ),
        )
      : null;

    fill(root, header, grid, markerRow, unregistered);
  }

  const offs = ['data', 'descriptors', 'mode', 'unregistered'].map((e) => store.on(e, render));
  render();
  return { destroy: () => offs.forEach((off) => off()) };
}
