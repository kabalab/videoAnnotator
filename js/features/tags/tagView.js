import { fill, h, plural } from '../../core/dom.js';
import { store, canEdit, getTag, sortedTags } from '../../core/store.js';
import { href } from '../../core/router.js';
import { usageCounts } from '../../data/repository.js';
import { icon } from '../../ui/icons.js';
import { search } from '../search/searchIndex.js';
import { renderResults } from '../search/searchView.js';
import { openDescriptorManager } from '../descriptors/descriptorManager.js';

function swatch(color) {
  return h('span', { class: 'tag-swatch', style: { '--chip': color || '#6b7383' }, 'aria-hidden': 'true' });
}

export function mountTagView(container, route) {
  let selectedId = route.params.id || null;
  const root = h('div', { class: 'page tags-page' });
  container.append(root);

  function render() {
    const counts = usageCounts('tag');
    const tags = sortedTags();
    const selected = selectedId ? getTag(selectedId) : null;
    document.title = `${selected ? selected.name : 'Tags'} \u00b7 Video Annotator`;

    const sidebar = h(
      'nav',
      { class: 'tag-list', 'aria-label': 'Tags' },
      tags.length
        ? tags.map((t) =>
            h(
              'a',
              { class: ['tag-item', t.id === selectedId && 'is-active'], href: href(`/tags/${encodeURIComponent(t.id)}`), 'aria-current': t.id === selectedId ? 'page' : null },
              swatch(t.color),
              h('span', { class: 'tag-item-text' }, h('span', { class: 'tag-item-name' }, t.name)),
              h('span', { class: 'tag-item-count' }, counts.get(t.id) || 0),
            ),
          )
        : h('p', { class: 'muted' }, 'No tags yet.'),
    );

    let main;
    if (selected) {
      const results = search({ filters: { tag: [selected.id] } }).filter((r) => r.doc.kind === 'note');
      main = [
        h(
          'header',
          { class: 'tag-head' },
          h('h2', { class: 'tag-title' }, swatch(selected.color), selected.name),
          h('p', { class: 'muted' }, plural(results.length, 'note')),
          selected.description && h('p', { class: 'tag-desc' }, selected.description),
        ),
        renderResults(results, { emptyText: 'No notes use this tag yet.' }),
      ];
    } else if (selectedId) {
      main = h('div', { class: 'empty-state empty-state-sm' }, h('p', {}, `There\u2019s no tag called \u201c${selectedId}\u201d.`));
    } else {
      main = h(
        'div',
        { class: 'empty-state empty-state-sm' },
        icon('tag', 'empty-icon'),
        h('p', {}, 'Tags are colored labels you can put on any note.'),
        h('p', { class: 'muted' }, 'Choose one to see its notes across every video.'),
      );
    }

    fill(
      root,
      h(
        'header',
        { class: 'page-header' },
        h('div', {}, h('h1', { class: 'page-title' }, 'Tags'), h('p', { class: 'page-sub' }, 'Notes grouped by tag, across all videos')),
        canEdit() && h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => openDescriptorManager('tag') }, icon('edit'), 'Manage tags'),
      ),
      h('div', { class: 'tags-layout' }, sidebar, h('div', { class: 'tags-main' }, main)),
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
