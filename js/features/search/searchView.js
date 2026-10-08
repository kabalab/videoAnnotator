import { fill, h, plural } from '../../core/dom.js';
import { store, getVideo } from '../../core/store.js';
import { navigate, videoHref } from '../../core/router.js';
import { displayTimeTokens, formatTime } from '../../core/time.js';
import { icon } from '../../ui/icons.js';
import { noteChips, privateBadge } from '../descriptors/chips.js';
import { videoThumb } from '../library/libraryView.js';
import { search, groupByVideo, queryTerms } from './searchIndex.js';
import { availableFilters, filtersFromQuery, hasActiveFilters } from './filters.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text, terms) {
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi');
  return String(text)
    .split(re)
    .map((part, i) => (i % 2 ? h('mark', {}, part) : part));
}

function snippetAround(text, terms, max = 220) {
  const flat = displayTimeTokens(text).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const lower = flat.toLowerCase();
  const idx = terms.reduce((best, t) => {
    const i = lower.indexOf(t);
    return i >= 0 && (best < 0 || i < best) ? i : best;
  }, -1);
  const start = idx > 70 ? idx - 70 : 0;
  const slice = flat.slice(start, start + max).trim();
  return `${start ? '\u2026' : ''}${slice}${start + max < flat.length ? '\u2026' : ''}`;
}

function resultRow({ doc }, video, terms) {
  const isVideo = doc.kind === 'video';
  const note = isVideo ? null : video.notes.find((n) => n.id === doc.noteId);
  const link = isVideo ? videoHref(video.id) : videoHref(video.id, { t: doc.timestamp ?? undefined, note: doc.noteId });
  const kind = isVideo
    ? h('span', { class: 'result-badge' }, icon('film'), 'Video')
    : doc.type === 'timestamp'
      ? h('span', { class: 'note-time' }, formatTime(doc.timestamp))
      : h('span', { class: 'result-badge' }, icon('note'), 'General');
  return h(
    'li',
    {},
    h(
      'a',
      { class: ['result', note?.visibility === 'private' && 'is-private'], href: link },
      h('span', { class: 'result-kind' }, kind),
      h(
        'div',
        { class: 'result-body' },
        doc.title && h('div', { class: 'result-title' }, highlight(doc.title, terms)),
        doc.content && h('p', { class: 'result-snippet' }, highlight(snippetAround(doc.content, terms), terms)),
        note && (note.tags.length || note.markers.length || note.visibility === 'private') ? h('div', { class: 'note-meta' }, noteChips(note), note.visibility === 'private' && privateBadge()) : null,
      ),
    ),
  );
}

export function renderResults(results, { terms = [], emptyText = 'No matches.' } = {}) {
  if (!results.length) return h('div', { class: 'empty-state empty-state-sm' }, icon('search', 'empty-icon'), h('p', {}, emptyText));
  return h(
    'div',
    { class: 'results' },
    groupByVideo(results).map((g) => {
      const video = getVideo(g.videoId);
      if (!video) return null;
      return h(
        'section',
        { class: 'result-group' },
        h(
          'a',
          { class: 'result-group-head', href: videoHref(video.id) },
          videoThumb(video, { quality: 'mqdefault', className: 'thumb thumb-sm' }),
          h('div', {}, h('h2', { class: 'result-video-title' }, video.title), h('span', { class: 'muted' }, plural(g.items.length, 'match', 'matches'))),
        ),
        h('ul', { class: 'result-list' }, g.items.map((r) => resultRow(r, video, terms))),
      );
    }),
  );
}

// Remember which filter menu is open across re-renders triggered by checkbox changes.
let openFilterId = null;

function filterMenu(filter, selected, onChange) {
  const options = filter.options();
  const labels = selected.map((v) => options.find((o) => o.value === v)?.label || v);
  const details = h('details', { class: ['filter', selected.length && 'is-active'], open: openFilterId === filter.id });
  details.addEventListener('toggle', () => {
    if (details.open) openFilterId = filter.id;
    else if (openFilterId === filter.id) openFilterId = null;
  });
  details.append(
    h(
      'summary',
      { class: 'filter-summary' },
      h('span', { class: 'filter-label' }, filter.label),
      selected.length ? h('span', { class: 'filter-value' }, labels[0] + (labels.length > 1 ? ` +${labels.length - 1}` : '')) : h('span', { class: 'filter-value muted' }, 'All'),
      icon('chevronDown', 'filter-chevron'),
    ),
    h(
      'div',
      { class: 'filter-menu' },
      options.length
        ? options.map((o) =>
            h(
              'label',
              { class: 'filter-option' },
              h('input', {
                type: 'checkbox',
                checked: selected.includes(o.value),
                onchange: (e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value)),
              }),
              o.color && h('span', { class: 'chip-dot', style: { '--chip': o.color } }),
              o.marker && icon('flag', 'filter-flag'),
              h('span', {}, o.label),
            ),
          )
        : h('p', { class: 'muted' }, 'Nothing to filter by yet.'),
      selected.length ? h('button', { class: 'link-btn', type: 'button', onclick: () => onChange([]) }, 'Clear') : null,
    ),
  );
  return details;
}

export function mountSearchView(container, route) {
  let query = route.query;
  const root = h('div', { class: 'page search-page' });
  container.append(root);

  const setQuery = (next) => navigate('/search', next, { replace: true });

  function render() {
    const q = query.q || '';
    const filters = filtersFromQuery(query);
    const active = hasActiveFilters(filters);
    document.title = q ? `\u201c${q}\u201d \u00b7 Search` : 'Search \u00b7 Video Annotator';

    const filterBar = h(
      'div',
      { class: 'filter-bar', role: 'group', 'aria-label': 'Filters' },
      availableFilters().map((f) => filterMenu(f, filters[f.id] || [], (vals) => setQuery({ ...query, [f.id]: vals.length ? vals.join(',') : undefined }))),
      active && h('button', { class: 'link-btn', type: 'button', onclick: () => { openFilterId = null; setQuery({ q: q || undefined }); } }, 'Clear filters'),
    );

    let content;
    let countText = '';
    if (!q.trim() && !active) {
      content = h(
        'div',
        { class: 'empty-state empty-state-sm' },
        icon('search', 'empty-icon'),
        h('p', {}, 'Search across every video: titles, descriptions, notes, tags and markers.'),
        h('p', { class: 'muted' }, 'Type in the search box above (press / to jump there), or pick a filter to browse.'),
      );
    } else {
      const results = search({ q, filters });
      countText = plural(results.length, 'result');
      content = renderResults(results, { terms: queryTerms(q), emptyText: q ? `Nothing matches \u201c${q}\u201d${active ? ' with these filters' : ''}.` : 'Nothing matches these filters.' });
    }

    fill(
      root,
      h('header', { class: 'page-header' }, h('div', {}, h('h1', { class: 'page-title' }, q ? `Results for \u201c${q}\u201d` : 'Search'), countText && h('p', { class: 'page-sub' }, countText))),
      filterBar,
      content,
    );
  }

  const onDocClick = (e) => {
    if (!e.target.closest('.filter')) {
      root.querySelectorAll('details.filter[open]').forEach((d) => {
        d.open = false;
      });
      openFilterId = null;
    }
  };
  document.addEventListener('click', onDocClick);
  const offs = ['data', 'descriptors', 'mode'].map((e) => store.on(e, render));
  render();

  return {
    update(r) {
      query = r.query;
      render();
    },
    destroy() {
      offs.forEach((off) => off());
      document.removeEventListener('click', onDocClick);
      openFilterId = null;
    },
  };
}
