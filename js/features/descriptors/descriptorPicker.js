import { h } from '../../core/dom.js';
import { sortedTags, sortedMarkers } from '../../core/store.js';
import { createDescriptor, descriptorsAvailable } from '../../data/repository.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { tagChip, markerChip } from './chips.js';

let uid = 0;

// Combobox for attaching tags or markers, with inline "Create tag 'x'".
export function createDescriptorPicker({ kind, label }) {
  let selected = [];
  let active = 0;
  let menuOpen = false;
  const noun = kind === 'tag' ? 'tag' : 'marker';
  const menuId = `picker-menu-${++uid}`;

  const chipsEl = h('div', { class: 'picker-chips' });
  const input = h('input', {
    class: 'picker-input',
    type: 'text',
    placeholder: `Add ${noun}\u2026`,
    'aria-label': `Add ${noun}`,
    role: 'combobox',
    'aria-expanded': 'false',
    'aria-autocomplete': 'list',
    'aria-controls': menuId,
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const menu = h('ul', { class: 'picker-menu', role: 'listbox', id: menuId, hidden: true });
  const field = h('div', { class: 'picker-field' }, chipsEl, input);
  field.addEventListener('mousedown', (e) => {
    if (e.target === field || e.target === chipsEl) {
      e.preventDefault();
      input.focus();
    }
  });
  const el = h('div', { class: `field picker picker-${kind}` }, h('span', { class: 'field-label' }, label), field, menu);

  const all = () => (kind === 'tag' ? sortedTags() : sortedMarkers());
  const chip = kind === 'tag' ? tagChip : markerChip;

  function renderChips() {
    chipsEl.replaceChildren(...selected.map((id) => chip(id, { onRemove: () => remove(id) })).filter(Boolean));
  }

  function options() {
    const q = input.value.trim().toLowerCase();
    const opts = all()
      .filter((d) => !selected.includes(d.id) && (!q || d.name.toLowerCase().includes(q)))
      .map((item) => ({ type: 'existing', item }));
    if (q && descriptorsAvailable() && !all().some((d) => d.name.toLowerCase() === q)) opts.push({ type: 'create', name: input.value.trim() });
    return opts;
  }

  function renderMenu() {
    const opts = options();
    if (!menuOpen || !opts.length) {
      menu.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      return;
    }
    active = Math.max(0, Math.min(active, opts.length - 1));
    menu.replaceChildren(
      ...opts.map((o, i) =>
        h(
          'li',
          {
            id: `${menuId}-${i}`,
            class: ['picker-option', i === active && 'is-active', o.type === 'create' && 'is-create'],
            role: 'option',
            'aria-selected': String(i === active),
            onmousedown: (e) => {
              e.preventDefault();
              choose(o);
            },
            onmousemove: () => {
              if (active !== i) {
                active = i;
                renderMenu();
              }
            },
          },
          o.type === 'create'
            ? [icon('plus'), h('span', {}, `Create ${noun} \u201c${o.name}\u201d`)]
            : [
                kind === 'tag' ? h('span', { class: 'chip-dot', style: { '--chip': o.item.color } }) : icon('flag', 'picker-flag'),
                h('span', { class: 'picker-option-name' }, o.item.name),
                o.item.date && h('span', { class: 'muted' }, o.item.date),
              ],
        ),
      ),
    );
    menu.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', `${menuId}-${active}`);
  }

  async function choose(o) {
    if (o.type === 'create') {
      try {
        const { item } = await createDescriptor(kind, o.name);
        add(item.id);
      } catch (e) {
        toast(e.message, { kind: 'error', duration: 6000 });
      }
    } else add(o.item.id);
    input.value = '';
    active = 0;
    renderMenu();
  }

  function add(id) {
    if (!selected.includes(id)) selected = [...selected, id];
    renderChips();
  }

  function remove(id) {
    selected = selected.filter((x) => x !== id);
    renderChips();
    renderMenu();
  }

  input.addEventListener('focus', () => {
    menuOpen = true;
    renderMenu();
  });
  input.addEventListener('blur', () => {
    menuOpen = false;
    renderMenu();
  });
  input.addEventListener('input', () => {
    menuOpen = true;
    active = 0;
    renderMenu();
  });
  input.addEventListener('keydown', (e) => {
    const opts = options();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      menuOpen = true;
      if (opts.length) active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      renderMenu();
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      if (!menu.hidden && opts.length) {
        e.preventDefault();
        choose(opts[active]);
      }
    } else if (e.key === 'Escape') {
      if (!menu.hidden) {
        e.preventDefault();
        e.stopPropagation();
        menuOpen = false;
        renderMenu();
      }
    } else if (e.key === 'Backspace' && !input.value && selected.length) {
      remove(selected[selected.length - 1]);
    }
  });

  return {
    el,
    get value() {
      return [...selected];
    },
    setValue(ids) {
      selected = [...(ids || [])];
      input.value = '';
      renderChips();
    },
    refresh() {
      renderChips();
      if (menuOpen) renderMenu();
    },
  };
}
