import { config } from '../../config.js';
import { fill, h, plural } from '../../core/dom.js';
import { store, canEdit, sortedTags, sortedMarkers } from '../../core/store.js';
import { saveDescriptor, deleteDescriptor, createDescriptor, usageCounts, descriptorsAvailable } from '../../data/repository.js';
import { openModal, choose, confirmDanger } from '../../ui/modal.js';
import { segmented } from '../../ui/segmented.js';
import { toast } from '../../ui/toast.js';
import { icon } from '../../ui/icons.js';

const NOUN = { tag: 'tag', marker: 'marker' };

export function openDescriptorManager(initialTab = 'tag') {
  if (!canEdit()) return null;
  let tab = initialTab;
  const body = h('div', { class: 'dm' });
  const offs = [];
  const modal = openModal({ title: 'Tags & markers', body, size: 'lg', onClose: () => offs.forEach((off) => off()) });

  async function save(item) {
    try {
      await saveDescriptor(tab, item);
    } catch (e) {
      toast(e.message, { kind: 'error', duration: 6000 });
      render();
    }
  }

  async function remove(item, count) {
    const noun = NOUN[tab];
    let removeReferences = false;
    if (count) {
      const choice = await choose({
        title: `Delete ${noun} \u201c${item.name}\u201d?`,
        message: `It\u2019s used by ${plural(count, 'note')}.`,
        detail: 'Removing it from those notes rewrites each affected video file. Keeping the references leaves gray \u201cunknown\u201d chips you can fix later.',
        choices: [
          { id: 'keep', label: 'Delete, keep references' },
          { id: 'remove', label: `Delete and remove from ${plural(count, 'note')}`, kind: 'danger' },
        ],
      });
      if (!choice) return;
      removeReferences = choice === 'remove';
    } else if (!(await confirmDanger({ title: `Delete ${noun} \u201c${item.name}\u201d?`, message: 'No notes use it.' }))) {
      return;
    }
    try {
      await deleteDescriptor(tab, item.id, { removeReferences });
    } catch (e) {
      toast(e.message, { kind: 'error', duration: 6000 });
    }
  }

  function colorPicker(item) {
    const details = h('details', { class: 'swatch-picker' });
    const pick = (color) => {
      details.open = false;
      if (color !== item.color) save({ ...item, color });
    };
    details.append(
      h('summary', { class: 'swatch-current', style: { '--chip': item.color }, 'aria-label': `Color for ${item.name}`, title: 'Change color' }),
      h(
        'div',
        { class: 'swatch-menu' },
        h('div', { class: 'swatch-grid' }, config.tagSwatches.map((c) => h('button', { class: ['swatch', c === item.color && 'is-active'], type: 'button', style: { '--chip': c }, 'aria-label': c, onclick: () => pick(c) }))),
        h('label', { class: 'swatch-custom' }, h('input', { type: 'color', value: item.color, onchange: (e) => pick(e.target.value) }), h('span', {}, 'Custom color')),
      ),
    );
    return details;
  }

  function textInput(item, key, placeholder, extra = {}) {
    return h('input', {
      class: `input input-sm dm-${key}`,
      value: item[key] ?? '',
      placeholder,
      'aria-label': `${placeholder} for ${item.name}`,
      dataset: { fk: `${item.id}:${key}` },
      onchange: (e) => save({ ...item, [key]: e.target.value }),
      onkeydown: (e) => {
        if (e.key === 'Enter') e.target.blur();
      },
      ...extra,
    });
  }

  function descriptionInput(item) {
    const area = h('textarea', {
      class: 'input dm-description',
      rows: '1',
      placeholder: 'Description (optional)',
      'aria-label': `Description for ${item.name}`,
      dataset: { fk: `${item.id}:description` },
      onchange: (e) => save({ ...item, description: e.target.value }),
    });
    area.value = item.description ?? '';
    const fit = () => {
      area.style.height = 'auto';
      area.style.height = `${area.scrollHeight + 2}px`;
    };
    area.addEventListener('input', fit);
    requestAnimationFrame(fit);
    return area;
  }

  function row(item, count) {
    const isTag = tab === 'tag';
    return h(
      'li',
      { class: 'dm-row' },
      isTag ? colorPicker(item) : h('span', { class: 'dm-flag' }, icon('flag')),
      textInput(item, 'name', 'Name', { required: true }),
      h('span', { class: 'dm-count', title: 'Notes using it' }, plural(count, 'note')),
      h('button', { class: 'icon-btn icon-btn-sm', type: 'button', 'aria-label': `Delete ${item.name}`, title: 'Delete', onclick: () => remove(item, count) }, icon('trash')),
      descriptionInput(item),
    );
  }

  function newForm() {
    const input = h('input', { class: 'input', placeholder: `New ${NOUN[tab]} name`, 'aria-label': `New ${NOUN[tab]} name`, dataset: { fk: 'new' } });
    return h(
      'form',
      {
        class: 'dm-new',
        onsubmit: async (e) => {
          e.preventDefault();
          const name = input.value.trim();
          if (!name) return;
          try {
            await createDescriptor(tab, name);
            input.value = '';
          } catch (err) {
            toast(err.message, { kind: 'error' });
          }
        },
      },
      input,
      h('button', { class: 'btn btn-primary', type: 'submit' }, icon('plus'), `Add ${NOUN[tab]}`),
    );
  }

  function render() {
    const focusKey = document.activeElement?.dataset?.fk;
    const counts = usageCounts(tab);
    const list = tab === 'tag' ? sortedTags() : sortedMarkers();
    const tabs = segmented({
      label: 'Kind',
      value: tab,
      options: [
        { value: 'tag', label: `Tags (${sortedTags().length})`, icon: 'tag' },
        { value: 'marker', label: `Markers (${sortedMarkers().length})`, icon: 'flag' },
      ],
      onChange: (v) => {
        tab = v;
        render();
      },
    });
    fill(
      body,
      h('div', { class: 'dm-top' }, tabs.el),
      h(
        'p',
        { class: 'muted dm-explain' },
        tab === 'tag'
          ? 'Tags describe what a note is about (Important, Question\u2026). A note can have several, and each tag has its own color.'
          : 'Markers record the viewing or session a note was made in (First Watch, April 2026\u2026).',
      ),
      !descriptorsAvailable() && h('p', { class: 'form-error' }, 'descriptors.json couldn\u2019t be loaded, so changes can\u2019t be saved until it\u2019s fixed.'),
      list.length ? h('ul', { class: ['dm-list', `dm-list-${tab}`] }, list.map((item) => row(item, counts.get(item.id) || 0))) : h('p', { class: 'muted' }, `No ${NOUN[tab]}s yet.`),
      newForm(),
    );
    if (focusKey) body.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus();
  }

  offs.push(store.on('descriptors', render), store.on('data', render), store.on('mode', () => !canEdit() && modal.close()));
  render();
  return modal;
}
