import { h } from '../core/dom.js';
import { icon } from './icons.js';

const ICONS = { info: 'info', warning: 'warning', error: 'warning', success: 'check' };
const dismissed = new Set(readDismissed());

function readDismissed() {
  try {
    return JSON.parse(sessionStorage.getItem('va.dismissedBanners') || '[]');
  } catch {
    return [];
  }
}

function host() {
  return document.getElementById('banners');
}

export function showBanner(id, { kind = 'info', title, message, detail, actions = [], dismissible = false }) {
  if (dismissible && dismissed.has(id)) return;
  hideBanner(id);
  const el = h(
    'div',
    { class: `banner banner-${kind}`, dataset: { banner: id }, role: kind === 'error' ? 'alert' : 'status' },
    icon(ICONS[kind], 'banner-icon'),
    h(
      'div',
      { class: 'banner-text' },
      title && h('strong', { class: 'banner-title' }, title),
      message && h('span', { class: 'banner-message' }, message),
      detail && h('span', { class: 'banner-detail' }, detail),
    ),
    h(
      'div',
      { class: 'banner-actions' },
      actions.map((a) => h('button', { class: `btn btn-sm ${a.primary ? 'btn-primary' : 'btn-secondary'}`, type: 'button', onclick: a.onClick }, a.label)),
      dismissible &&
        h(
          'button',
          {
            class: 'icon-btn icon-btn-sm',
            type: 'button',
            'aria-label': 'Dismiss',
            onclick: () => {
              dismissed.add(id);
              try {
                sessionStorage.setItem('va.dismissedBanners', JSON.stringify([...dismissed]));
              } catch {
                // Dismissal just won't survive a reload.
              }
              hideBanner(id);
            },
          },
          icon('x'),
        ),
    ),
  );
  host()?.append(el);
}

export function hideBanner(id) {
  host()?.querySelector(`[data-banner="${id}"]`)?.remove();
}
