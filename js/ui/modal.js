import { h } from '../core/dom.js';
import { icon } from './icons.js';

// Native <dialog> gives focus trapping, Esc to close, and top-layer rendering (visible over fullscreen).
export function openModal({ title, body, actions = [], size = 'md', onClose, className = '' }) {
  const bodyEl = h('div', { class: 'modal-body' });
  const footer = h('footer', { class: 'modal-footer' });
  const dlg = h(
    'dialog',
    { class: `modal modal-${size} ${className}`.trim(), 'aria-label': title },
    h(
      'div',
      { class: 'modal-panel' },
      h(
        'header',
        { class: 'modal-header' },
        h('h2', { class: 'modal-title' }, title),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dlg.close() }, icon('x')),
      ),
      bodyEl,
      footer,
    ),
  );

  const setActions = (list) => {
    footer.replaceChildren(...list.filter(Boolean));
    footer.hidden = !list.filter(Boolean).length;
  };
  const setBody = (node) => bodyEl.replaceChildren(...[].concat(node).filter(Boolean));

  setBody(body);
  setActions(actions);

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => {
    onClose?.();
    dlg.remove();
  });

  (document.fullscreenElement || document.body).append(dlg);
  dlg.showModal();
  return { el: dlg, body: bodyEl, close: () => dlg.close(), setBody, setActions };
}

// Resolves with the chosen id, or null if dismissed.
export function choose({ title, message, detail, choices, cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    let result = null;
    const m = openModal({
      title,
      size: 'sm',
      body: [h('p', { class: 'modal-message' }, message), detail && h('p', { class: 'modal-detail' }, detail)],
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, cancelLabel),
        ...choices.map((c) =>
          h(
            'button',
            {
              class: `btn ${c.kind === 'danger' ? 'btn-danger' : c.kind === 'primary' ? 'btn-primary' : 'btn-secondary'}`,
              type: 'button',
              onclick: () => {
                result = c.id;
                m.close();
              },
            },
            c.label,
          ),
        ),
      ],
      onClose: () => resolve(result),
    });
  });
}

export async function confirmDanger({ title, message, detail, confirmLabel = 'Delete' }) {
  return (await choose({ title, message, detail, choices: [{ id: 'yes', label: confirmLabel, kind: 'danger' }] })) === 'yes';
}
