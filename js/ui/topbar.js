import { h, debounce, isTypingTarget } from '../core/dom.js';
import { store, state, canEdit, editorActive, setUiMode } from '../core/store.js';
import { navigate, parseHash } from '../core/router.js';
import { icon } from './icons.js';
import { openSettings } from '../features/settings/connectionPanel.js';
import { openDescriptorManager } from '../features/descriptors/descriptorManager.js';
import { openHelp } from './help.js';

const STATUS = {
  'fsa-connected': { cls: 'ok', label: 'Saving to project folder' },
  'fsa-disconnected': { cls: 'idle', label: 'Project folder not connected' },
  'fsa-needs-permission': { cls: 'idle', label: 'Project folder needs permission' },
  'fsa-error': { cls: 'bad', label: 'Saving failed' },
  fallback: { cls: 'warn', label: 'Direct saving unavailable' },
};

export function createTopbar(el) {
  const input = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Search notes, tags, markers\u2026',
    'aria-label': 'Search across all videos',
    autocomplete: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
  });

  const submit = (fromTyping) => {
    const q = input.value.trim();
    const route = parseHash();
    if (route.name === 'search') navigate('/search', { ...route.query, q: q || undefined }, { replace: true });
    else if (q && (!fromTyping || q.length >= 2)) navigate('/search', { q });
  };
  const live = debounce(() => submit(true), 300);
  input.addEventListener('input', live);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      live.cancel();
      submit(false);
    } else if (e.key === 'Escape') {
      input.value = '';
      input.blur();
      if (parseHash().name === 'search') submit(false);
    }
  });

  const navLibrary = h('a', { class: 'nav-link', href: '#/', 'aria-label': 'Library' }, icon('grid'), h('span', {}, 'Library'));
  const navTags = h('a', { class: 'nav-link', href: '#/tags', 'aria-label': 'Tags' }, icon('tag'), h('span', {}, 'Tags'));
  const navMarkers = h('a', { class: 'nav-link', href: '#/markers', 'aria-label': 'Markers' }, icon('flag'), h('span', {}, 'Markers'));
  const right = h('div', { class: 'topbar-right' });

  el.replaceChildren(
    h(
      'div',
      { class: 'topbar-inner' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'Video Annotator home' }, h('span', { class: 'brand-mark' }, icon('play')), h('span', { class: 'brand-name' }, 'Annotator')),
      h('nav', { class: 'topbar-nav', 'aria-label': 'Main' }, navLibrary, navTags, navMarkers),
      h('label', { class: 'search' }, icon('search', 'search-icon'), input, h('kbd', { class: 'search-kbd', 'aria-hidden': 'true' }, '/')),
      right,
    ),
  );

  function renderRight() {
    const env = state.env;
    const items = [];
    if (editorActive()) {
      if (state.drafts.length) {
        items.push(
          h(
            'button',
            { class: 'pill pill-warning unsaved-pill', type: 'button', onclick: () => openSettings({ focus: 'drafts' }), title: 'Changes that are only saved in this browser' },
            icon('warning'),
            `${state.drafts.length} unsaved`,
          ),
        );
      }
      items.push(
        h(
          'div',
          { class: 'segmented segmented-sm mode-toggle', role: 'group', 'aria-label': 'Mode' },
          modeButton('edit', 'Edit', 'edit'),
          modeButton('view', 'View', 'eye'),
        ),
      );
      if (canEdit()) {
        items.push(h('button', { class: 'icon-btn', type: 'button', title: 'Tags & markers', 'aria-label': 'Manage tags and markers', onclick: () => openDescriptorManager() }, icon('tag')));
      }
      const status = env.isLocal
        ? STATUS[state.persistence.kind] || { cls: 'idle', label: 'Settings' }
        : { cls: state.drafts.length ? 'warn' : 'ok', label: state.drafts.length ? 'Changes stay in this browser' : 'Signed in on the public site' };
      items.push(
        h(
          'button',
          { class: 'icon-btn status-btn', type: 'button', title: `Settings \u00b7 ${status.label}`, 'aria-label': `Settings. ${status.label}`, onclick: () => openSettings() },
          icon('settings'),
          h('span', { class: `status-dot status-${status.cls}` }),
        ),
      );
    } else {
      items.push(h('span', { class: 'env-badge env-public', title: 'Read-only public view' }, icon('eye'), env.previewPublic ? 'Public preview' : 'Public'));
      items.push(h('button', { class: 'icon-btn', type: 'button', title: 'Settings', 'aria-label': 'Settings', onclick: () => openSettings() }, icon('settings')));
    }
    items.push(h('button', { class: 'icon-btn', type: 'button', title: 'Help (?)', 'aria-label': 'Help', onclick: () => openHelp() }, icon('help')));
    right.replaceChildren(...items);
  }

  function modeButton(mode, label, iconName) {
    const active = state.uiMode === mode;
    return h(
      'button',
      { type: 'button', class: active ? 'is-active' : '', 'aria-pressed': String(active), 'aria-label': label, onclick: () => setUiMode(mode), title: mode === 'edit' ? 'Editing mode' : 'View mode: read-only, private notes still shown' },
      icon(iconName),
      h('span', {}, label),
    );
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || document.querySelector('dialog[open]')) return;
    if (e.key === '/') {
      e.preventDefault();
      input.focus();
      input.select();
    } else if (e.key === '?') {
      e.preventDefault();
      openHelp();
    }
  });

  store.on('mode', renderRight);
  store.on('persistence', renderRight);
  store.on('drafts', renderRight);
  renderRight();

  return {
    setRoute(route) {
      const onLibrary = route.name === 'library' || route.name === 'video';
      navLibrary.classList.toggle('is-active', onLibrary);
      if (onLibrary) navLibrary.setAttribute('aria-current', 'page');
      else navLibrary.removeAttribute('aria-current');
      const onTags = route.name === 'tags';
      navTags.classList.toggle('is-active', onTags);
      if (onTags) navTags.setAttribute('aria-current', 'page');
      else navTags.removeAttribute('aria-current');
      const onMarkers = route.name === 'markers';
      navMarkers.classList.toggle('is-active', onMarkers);
      if (onMarkers) navMarkers.setAttribute('aria-current', 'page');
      else navMarkers.removeAttribute('aria-current');
      if (route.name === 'search') {
        if (document.activeElement !== input) input.value = route.query.q || '';
      } else if (document.activeElement !== input) input.value = '';
    },
    focusSearch: () => input.focus(),
  };
}
