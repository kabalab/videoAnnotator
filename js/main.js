import { config } from './config.js';
import { detectEnvironment, exitPreviewUrl } from './core/env.js';
import { store, state, canEdit, editorActive, storedEditorSessionMatches } from './core/store.js';
import { startRouter, parseHash } from './core/router.js';
import { h, plural } from './core/dom.js';
import * as repo from './data/repository.js';
import { rebuildIndex } from './features/search/searchIndex.js';
import { createTopbar } from './ui/topbar.js';
import { showBanner, hideBanner } from './ui/banner.js';
import { toast } from './ui/toast.js';
import { choose } from './ui/modal.js';
import { openSettings, connectAction, retryAction, writeDraftsAction } from './features/settings/connectionPanel.js';
import { mountLibraryView } from './features/library/libraryView.js';
import { mountVideoView } from './features/video/videoView.js';
import { mountSearchView } from './features/search/searchView.js';
import { mountTagView } from './features/tags/tagView.js';
import { mountMarkerView } from './features/markers/markerView.js';

const MOUNTS = {
  library: mountLibraryView,
  video: mountVideoView,
  search: mountSearchView,
  tags: mountTagView,
  markers: mountMarkerView,
};

const viewEl = document.getElementById('view');
let current = null;
let topbar = null;
let routerStarted = false;

function readPref(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function detectReloadDuringSave() {
  try {
    const at = Number(sessionStorage.getItem('va.savingAt'));
    sessionStorage.removeItem('va.savingAt');
    return at > 0 && Date.now() - at < 6000;
  } catch {
    return false;
  }
}

function syncModeClass() {
  document.body.classList.toggle('mode-edit', canEdit());
  document.body.classList.toggle('mode-view', !canEdit());
}

// ------------------------------------------------------------------ routing

function mountNotFound(container) {
  container.append(
    h(
      'section',
      { class: 'empty-page' },
      h('h1', {}, 'Page not found'),
      h('p', {}, 'That link doesn\u2019t match anything in this site.'),
      h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to the library'),
    ),
  );
  return {};
}

function renderFatal() {
  current?.view.destroy?.();
  current = null;
  document.title = 'Video Annotator';
  viewEl.replaceChildren(
    h(
      'section',
      { class: 'fatal' },
      h('h1', {}, 'The library couldn\u2019t be loaded'),
      h('p', {}, `The app reads ${state.fatal.path} to know which videos exist. Loading it failed with:`),
      h('pre', {}, state.fatal.message),
      h('p', {}, 'Fix the file (a JSON validator will point at the exact spot), then try again. If the file is missing, create it with:'),
      h('pre', { class: 'fatal-ok' }, '{\n  "schemaVersion": 1,\n  "videos": []\n}'),
      h('div', { class: 'fatal-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => repo.loadAll() }, 'Try again')),
    ),
  );
}

let hasRouted = false;

function renderRoute(route) {
  if (state.fatal) {
    renderFatal();
    return;
  }
  topbar.setRoute(route);
  const key = route.name === 'video' ? `video:${route.params.id}` : route.name;
  if (current?.key === key && current.view.update) {
    current.view.update(route);
    hasRouted = true;
    return;
  }
  current?.view.destroy?.();
  viewEl.replaceChildren();
  const mount = MOUNTS[route.name] || mountNotFound;
  current = { key, view: mount(viewEl, route) || {} };
  window.scrollTo({ top: 0, behavior: 'instant' });
  const keepFocus = document.activeElement?.closest?.('.search, dialog');
  if (hasRouted && !keepFocus) viewEl.focus({ preventScroll: true });
  hasRouted = true;
}

// ------------------------------------------------------------------ banners & feedback

function syncBanners() {
  const env = state.env;
  const p = state.persistence;
  const drafts = state.drafts.length;

  if (env.previewPublic) {
    showBanner('preview', {
      kind: 'info',
      title: 'Previewing the public site.',
      message: editorActive()
        ? 'You are signed in, the same as on the public site. Changes stay in this browser, and the project folder stays disconnected.'
        : 'This is the visitor view. Open Settings and enter the editor code to sign in, the same as on the public site.',
      actions: [{ label: 'Exit preview', onClick: () => { window.location.href = exitPreviewUrl(); } }],
    });
  }
  if (!editorActive()) {
    hideBanner('persist');
    hideBanner('descriptors');
    return;
  }

  if (!env.isLocal) {
    if (drafts) {
      showBanner('persist', {
        kind: 'warning',
        title: `${plural(drafts, 'changed file')} only in this browser.`,
        message: 'Copy a change code from Settings when you want to reapply these edits later.',
        actions: [{ label: 'Review', primary: true, onClick: () => openSettings({ focus: 'drafts' }) }],
      });
    } else hideBanner('persist');
  } else {
    const review = drafts ? { label: `Download changed files (${drafts})`, onClick: () => openSettings({ focus: 'drafts' }) } : null;
    switch (p.kind) {
      case 'fallback':
        showBanner('persist', {
          kind: 'warning',
          title: 'Direct saving is unavailable.',
          message: p.reason,
          detail: `Edits are kept as drafts in this browser. Download the changed files and replace them in the project, or open ${window.location.origin}${window.location.pathname} in Chrome or Edge to save directly.`,
          actions: [review].filter(Boolean),
          dismissible: !drafts,
        });
        break;
      case 'fsa-error':
        showBanner('persist', {
          kind: 'error',
          title: 'Couldn\u2019t save to the project folder.',
          message: p.reason,
          detail: 'Your changes are kept as drafts in this browser until they can be written.',
          actions: [{ label: 'Retry', primary: true, onClick: retryAction }, review].filter(Boolean),
        });
        break;
      case 'fsa-disconnected':
      case 'fsa-needs-permission': {
        if (!canEdit() && !drafts) {
          hideBanner('persist');
          break;
        }
        const remembered = p.kind === 'fsa-needs-permission';
        showBanner('persist', {
          kind: drafts ? 'warning' : 'info',
          title: remembered ? `Allow editing "${p.folder}".` : 'Connect your project folder.',
          message: drafts
            ? `${plural(drafts, 'changed file')} ${drafts === 1 ? 'is' : 'are'} only saved as drafts in this browser.`
            : remembered
              ? 'The browser needs one click per session before the app can save into your JSON files.'
              : 'Connect the project folder once so notes are saved straight into the JSON files.',
          actions: [{ label: remembered ? 'Allow access' : 'Connect folder', primary: true, onClick: connectAction }, review].filter(Boolean),
          dismissible: !drafts,
        });
        break;
      }
      case 'fsa-connected':
        if (drafts) {
          showBanner('persist', {
            kind: 'warning',
            title: `${plural(drafts, 'draft file')} not written yet.`,
            message: 'Some changes are only stored in this browser.',
            actions: [
              { label: 'Write to project files', primary: true, onClick: writeDraftsAction },
              { label: 'Review', onClick: () => openSettings({ focus: 'drafts' }) },
            ],
          });
        } else hideBanner('persist');
        break;
      default:
        hideBanner('persist');
    }
  }

  const descErr = state.issues.find((i) => i.level === 'error' && i.path === config.paths.descriptors);
  if (descErr) {
    showBanner('descriptors', {
      kind: 'error',
      title: 'Tags and markers couldn\u2019t be loaded.',
      message: descErr.message,
      actions: [{ label: 'Reload data', onClick: () => repo.loadAll() }],
    });
  } else hideBanner('descriptors');
}

function onSave(r) {
  if (!r || r.quiet) return;
  switch (r.status) {
    case 'saved':
      toast('Saved', { kind: 'success', duration: 1400 });
      break;
    case 'draft':
      if (r.error) toast('Couldn\u2019t write to the project folder. Your change is kept as a draft.', { kind: 'error', duration: 5000 });
      else {
        toast('Kept as a draft in this browser. It isn\u2019t in the project files yet.', {
          kind: 'warning',
          duration: 3600,
          action: { label: 'Details', fn: () => openSettings({ focus: 'drafts' }) },
        });
      }
      break;
    case 'error':
      toast(`Couldn\u2019t save: ${r.error.message}`, { kind: 'error', duration: 9000 });
      break;
    case 'cancelled':
      toast('Not saved.', { kind: 'info' });
      break;
    case 'reloaded':
      toast('Reloaded from disk.', { kind: 'info' });
      break;
    default:
  }
}

function wireEvents() {
  store.on('data', (p) => {
    rebuildIndex(p?.videoId);
    if (!routerStarted) return;
    if (state.fatal) renderFatal();
    else if (!current) renderRoute(parseHash());
  });
  store.on('descriptors', () => rebuildIndex());
  store.on('persistence', syncBanners);
  store.on('drafts', syncBanners);
  store.on('issues', syncBanners);
  store.on('mode', () => {
    syncModeClass();
    syncBanners();
  });
  store.on('save', onSave);

  window.addEventListener('unhandledrejection', (e) => {
    console.error(e.reason);
    toast(`Something went wrong: ${e.reason?.message || e.reason}`, { kind: 'error', duration: 7000 });
  });
}

// ------------------------------------------------------------------ boot

async function boot() {
  const env = detectEnvironment();
  state.env = env;
  if (env.isFile) return;

  state.editorSession = !env.isLocal && storedEditorSessionMatches();
  state.uiMode = editorActive() ? (readPref('va.uiMode') === 'view' ? 'view' : 'edit') : 'view';
  document.body.dataset.env = env.env.toLowerCase();
  syncModeClass();
  topbar = createTopbar(document.getElementById('topbar'));
  const reloadedDuringSave = detectReloadDuringSave();

  repo.hooks.onConflict = async (path) =>
    (await choose({
      title: 'File changed on disk',
      message: `${path} was changed outside the app after it was loaded.`,
      detail: 'Reload shows the file as it is now and drops your latest change. Overwrite replaces the file with your version.',
      choices: [
        { id: 'reload', label: 'Reload from disk' },
        { id: 'overwrite', label: 'Overwrite', kind: 'danger' },
      ],
    })) || 'cancel';

  wireEvents();
  await repo.initPersistence();
  await repo.loadAll();
  syncBanners();

  if (reloadedDuringSave && env.isLocal) {
    showBanner('reload', {
      kind: 'warning',
      title: 'The page reloaded while saving.',
      message: 'Live Server is probably watching the data folder. Start Live Server from the project folder so .vscode/settings.json applies, or add "data/**" and "videos/**" to liveServer.settings.ignoreFiles.',
      dismissible: true,
    });
  }

  routerStarted = true;
  startRouter(renderRoute);
}

boot().catch((err) => {
  console.error(err);
  viewEl.replaceChildren(
    h('section', { class: 'fatal' }, h('h1', {}, 'The app failed to start'), h('pre', {}, `${err.name}: ${err.message}`), h('p', {}, 'Check the browser console for details.')),
  );
});
