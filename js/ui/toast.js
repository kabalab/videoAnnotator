import { h } from '../core/dom.js';
import { icon } from './icons.js';

const ICONS = { success: 'check', error: 'warning', warning: 'warning', info: 'info' };

function host() {
  return document.getElementById('toasts');
}

// Toasts must live inside the fullscreen element to be visible while the player is fullscreen.
export function setToastHost(el) {
  const node = host();
  if (node) (el || document.body).append(node);
}

export function toast(message, { kind = 'info', action, duration = 2600 } = {}) {
  const container = host();
  if (!container) return () => {};
  const el = h(
    'div',
    { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    icon(ICONS[kind] || 'info', 'toast-icon'),
    h('span', { class: 'toast-msg' }, message),
    action && h('button', { class: 'toast-action', type: 'button', onclick: () => { action.fn(); dismiss(); } }, action.label),
  );
  container.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  let timer = setTimeout(dismiss, duration);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => {
    timer = setTimeout(dismiss, 1500);
  });

  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 260);
  }
  return dismiss;
}
