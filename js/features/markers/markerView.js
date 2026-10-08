import { fill, h, plural } from '../../core/dom.js';
import { store, canEdit, getMarker, sortedMarkers } from '../../core/store.js';
import { href } from '../../core/router.js';
import { usageCounts } from '../../data/repository.js';
import { icon } from '../../ui/icons.js';
import { search } from '../search/searchIndex.js';
import { renderResults } from '../search/searchView.js';
import { openDescriptorManager } from '../descriptors/descriptorManager.js';

export function mountMarkerView(container, route) {
  let selectedId = route.params.id || null;
  const root = h('div', { class: 'page markers-page' });
  container.append(root);

  function render() {
    const counts = usageCounts('marker');
    const markers = sortedMarkers();
    const selected = selectedId ? getMarker(selectedId) : null;
    document.title = `${selected ? selected.name : 'Markers'} \u00b7 Video Annotator`;

    const sidebar = h(
      'nav',
      { class: 'marker-list', 'aria-label': 'Markers' },
      markers.length
        ? markers.map((m) =>
            h(
              'a',
              { class: ['marker-item', m.id === selectedId && 'is-active'], href: href(`/markers/${encodeURIComponent(m.id)}`), 'aria-current': m.id === selectedId ? 'page' : null },
              icon('flag', 'marker-item-icon'),
              h('span', { class: 'marker-item-text' }, h('span', { class: 'marker-item-name' }, m.name)),
              h('span', { class: 'marker-item-count' }, counts.get(m.id) || 0),
            ),
          )
        : h('p', { class: 'muted' }, 'No markers yet.'),
    );

    let main;
    if (selected) {
      const results = search({ filters: { marker: [selected.id] } }).filter((r) => r.doc.kind === 'note');
      main = [
        h(
          'header',
          { class: 'marker-head' },
          h('h2', { class: 'marker-title' }, icon('flag'), selected.name),
          h('p', { class: 'muted' }, plural(results.length, 'note')),
          selected.description && h('p', { class: 'marker-desc' }, selected.description),
        ),
        renderResults(results, { emptyText: 'No notes use this marker yet.' }),
      ];
    } else if (selectedId) {
      main = h('div', { class: 'empty-state empty-state-sm' }, h('p', {}, `There\u2019s no marker called \u201c${selectedId}\u201d.`));
    } else {
      main = h(
        'div',
        { class: 'empty-state empty-state-sm' },
        icon('flag', 'empty-icon'),
        h('p', {}, 'Markers record the viewing or session a note was made in.'),
        h('p', { class: 'muted' }, 'Choose one to see its notes across every video.'),
      );
    }

    fill(
      root,
      h(
        'header',
        { class: 'page-header' },
        h('div', {}, h('h1', { class: 'page-title' }, 'Markers'), h('p', { class: 'page-sub' }, 'Notes grouped by viewing session, across all videos')),
        canEdit() && h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => openDescriptorManager('marker') }, icon('edit'), 'Manage markers'),
      ),
      h('div', { class: 'markers-layout' }, sidebar, h('div', { class: 'markers-main' }, main)),
    );
  }

  const offs = ['data', 'descriptors', 'mode'].map((e) => store.on(e, render));
  render();
  return {
    update(r) {
      selectedId = r.params.id || null;
      render();
    },
    destroy: () => offs.forEach((off) => off()),
  };
}
