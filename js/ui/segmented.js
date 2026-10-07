import { h } from '../core/dom.js';
import { icon } from './icons.js';

export function segmented({ options, value, onChange, label, size = '' }) {
  let current = value;
  const buttons = options.map((o) =>
    h(
      'button',
      {
        type: 'button',
        dataset: { value: o.value },
        title: o.title || null,
        onclick: () => set(o.value, true),
      },
      o.icon && icon(o.icon),
      h('span', {}, o.label),
    ),
  );
  const el = h('div', { class: ['segmented', size && `segmented-${size}`], role: 'group', 'aria-label': label }, buttons);

  function set(v, fromUser = false) {
    current = v;
    for (const b of buttons) {
      const on = b.dataset.value === v;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    if (fromUser) onChange?.(v);
  }
  set(value);

  return {
    el,
    get value() {
      return current;
    },
    set,
  };
}
