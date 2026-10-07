import { fill, h, plural } from '../../core/dom.js';
import { store, state } from '../../core/store.js';
import { publicPreviewUrl } from '../../core/env.js';
import { getPref, setPref } from '../../core/prefs.js';
import * as repo from '../../data/repository.js';
import { openModal, confirmDanger } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { icon } from '../../ui/icons.js';
import { renderIssues, collectIssues } from './issuesPanel.js';

// ---- actions shared with banners and the top bar (all must run from a click) ----

export async function connectAction() {
  try {
    if (state.persistence.kind === 'fsa-needs-permission') await repo.allowFolderAccess();
    else await repo.connectFolder();
    toast(`Connected to "${state.persistence.folder}"`, { kind: 'success' });
  } catch (e) {
    if (e.name === 'AbortError') return;
    toast(`Couldn\u2019t connect: ${e.message}`, { kind: 'error', duration: 9000 });
  }
}

export async function retryAction() {
  try {
    await repo.retryConnection();
    toast('Saved to the project folder', { kind: 'success' });
  } catch (e) {
    if (e.name === 'AbortError') return;
    toast(`Still couldn\u2019t save: ${e.message}`, { kind: 'error', duration: 9000 });
  }
}

export async function writeDraftsAction() {
  try {
    await repo.writeDraftsToFiles();
    toast('Drafts written to the project files', { kind: 'success' });
  } catch (e) {
    toast(`Couldn\u2019t write drafts: ${e.message}`, { kind: 'error', duration: 9000 });
  }
}

async function guarded(fn, okMessage) {
  try {
    await fn();
    if (okMessage) toast(okMessage, { kind: 'success' });
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message, { kind: 'error', duration: 8000 });
  }
}

// ---- settings modal ----

let openInstance = null;

export function openSettings({ focus } = {}) {
  openInstance?.close();
  const content = h('div', { class: 'settings' });
  const offs = [];
  const modal = openModal({
    title: 'Settings',
    body: content,
    size: 'lg',
    onClose: () => {
      offs.forEach((off) => off());
      openInstance = null;
    },
  });
  openInstance = modal;
  const render = () => fill(content, sections());
  for (const e of ['persistence', 'drafts', 'issues', 'data', 'descriptors']) offs.push(store.on(e, render));
  render();
  if (focus) requestAnimationFrame(() => content.querySelector(`[data-section="${focus}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
}

function section(id, title, ...children) {
  return h('section', { class: 'settings-section', dataset: { section: id } }, h('h3', { class: 'settings-heading' }, title), ...children);
}

function statusLine(cls, text, detail) {
  return h('div', { class: 'status-line' }, h('span', { class: `status-dot status-${cls}` }), h('div', {}, h('strong', {}, text), detail && h('p', { class: 'muted' }, detail)));
}

function sections() {
  const env = state.env;
  const out = [environmentSection()];
  if (env.isLocal) {
    out.push(folderSection());
    if (repo.fsaAvailable() && state.persistence.kind === 'fsa-connected') out.push(externalSection());
    out.push(draftsSection(), issuesSection(), preferencesSection());
  }
  out.push(privacySection());
  return out;
}

function environmentSection() {
  const env = state.env;
  const where = env.hostname || 'file';
  return section(
    'environment',
    'Environment',
    statusLine(
      env.isLocal ? 'ok' : 'idle',
      env.isLocal ? 'Running locally: editing is available' : env.previewPublic ? 'Previewing the public site' : 'Public site: read-only',
      `${where} \u00b7 matched rule: ${env.rule}`,
    ),
    env.isLocal &&
      h(
        'div',
        { class: 'settings-actions' },
        h('a', { class: 'btn btn-secondary btn-sm', href: publicPreviewUrl(), target: '_blank', rel: 'noopener' }, icon('eye'), 'Preview public site'),
        h('span', { class: 'muted' }, 'Opens a tab showing exactly what GitHub Pages visitors see.'),
      ),
  );
}

function folderSection() {
  const p = state.persistence;
  let body;
  switch (p.kind) {
    case 'fsa-connected':
      body = [
        statusLine('ok', `Connected to "${p.folder}"`, 'Changes are written straight into the JSON files in data/.'),
        h('div', { class: 'settings-actions' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => guarded(repo.disconnectFolder, 'Disconnected') }, 'Disconnect')),
      ];
      break;
    case 'fsa-needs-permission':
      body = [
        statusLine('idle', `"${p.folder}" is remembered`, 'Browsers ask once per session before a site can edit files again.'),
        h('div', { class: 'settings-actions' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: connectAction }, icon('folder'), 'Allow access'), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => guarded(repo.disconnectFolder) }, 'Forget folder')),
      ];
      break;
    case 'fsa-disconnected':
      body = [
        statusLine('idle', 'Not connected', 'Choose the project folder (the one containing index.html). Until then, edits are kept as drafts in this browser.'),
        h('div', { class: 'settings-actions' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: connectAction }, icon('folder'), 'Connect project folder')),
      ];
      break;
    case 'fsa-error':
      body = [
        statusLine('bad', 'Saving failed', p.reason),
        h('div', { class: 'settings-actions' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: retryAction }, 'Retry'), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: connectAction }, 'Choose folder again')),
      ];
      break;
    case 'fallback':
      body = [
        statusLine('warn', 'Direct saving is unavailable in this browser', p.reason),
        h(
          'ol',
          { class: 'steps' },
          h('li', {}, 'Keep editing. Every change is kept as a draft in this browser.'),
          h('li', {}, 'Use ', h('strong', {}, 'Download'), ' in Unsaved drafts below and move each file into the project at the path shown, replacing the old one.'),
          h('li', {}, 'Or open ', h('code', {}, `${window.location.origin}${window.location.pathname}`), ' in Chrome or Edge, where the app can save directly.'),
        ),
      ];
      break;
    default:
      body = [statusLine('idle', 'Checking\u2026')];
  }
  return section('folder', 'Project folder', ...body);
}

function externalSection() {
  const ext = state.external;
  let actions;
  if (ext.kind === 'granted') actions = [h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => guarded(repo.disconnectExternalVideos, 'External folder disconnected') }, 'Disconnect')];
  else if (ext.kind === 'prompt') actions = [h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => guarded(repo.allowExternalVideos, 'Access allowed') }, 'Allow access'), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => guarded(repo.disconnectExternalVideos) }, 'Forget')];
  else actions = [h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => guarded(repo.connectExternalVideos, 'External videos folder connected') }, icon('folder'), 'Choose videos folder')];
  return section(
    'external',
    'External videos folder (optional)',
    h('p', { class: 'muted' }, 'Large videos inside OneDrive get uploaded to the cloud and may be online-only. You can keep them in a folder outside OneDrive (for example D:\\Videos) instead. When a video\u2019s local file name exists there, the app plays it from that folder.'),
    ext.kind === 'granted' ? statusLine('ok', `Using "${ext.name}"`) : ext.kind === 'prompt' ? statusLine('idle', `"${ext.name}" needs permission`) : null,
    h('div', { class: 'settings-actions' }, ...actions),
  );
}

function draftsSection() {
  const drafts = state.drafts;
  if (!drafts.length) return section('drafts', 'Unsaved drafts', h('p', { class: 'muted' }, 'None. Everything is in the project files.'));
  const connected = state.persistence.kind === 'fsa-connected';
  return section(
    'drafts',
    `Unsaved drafts (${drafts.length})`,
    h('p', { class: 'muted' }, 'These changes are only stored in this browser. Downloaded files land in your Downloads folder: move each one to the path shown, replacing the old file. A draft clears itself once the project file matches it.'),
    h(
      'ul',
      { class: 'draft-list' },
      drafts.map((d) =>
        h(
          'li',
          { class: 'draft' },
          h('div', {}, h('code', {}, d.path), h('span', { class: 'muted' }, d.deleted ? ' \u00b7 delete this file' : ` \u00b7 ${new Date(d.savedAt).toLocaleString()}`)),
          d.deleted ? h('span', { class: 'muted' }, 'Remove manually') : h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => repo.downloadDraft(d.path) }, icon('download'), 'Download'),
        ),
      ),
    ),
    h(
      'div',
      { class: 'settings-actions' },
      connected && h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: writeDraftsAction }, 'Write all to project files'),
      drafts.some((d) => !d.deleted) && h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => repo.downloadAllDrafts() }, icon('download'), 'Download all'),
      h(
        'button',
        {
          class: 'btn btn-ghost btn-sm btn-danger-text',
          type: 'button',
          onclick: async () => {
            const ok = await confirmDanger({ title: 'Discard all drafts?', message: `${plural(drafts.length, 'changed file')} will be lost. The project files stay as they are.`, confirmLabel: 'Discard drafts' });
            if (ok) guarded(repo.discardDrafts, 'Drafts discarded');
          },
        },
        'Discard all',
      ),
    ),
  );
}

function issuesSection() {
  const count = collectIssues().length;
  return section('issues', count ? `Data issues (${count})` : 'Data issues', renderIssues());
}

function preferencesSection() {
  return section(
    'preferences',
    'Preferences',
    h(
      'label',
      { class: 'check' },
      h('input', { type: 'checkbox', checked: getPref('pauseWhileTyping'), onchange: (e) => setPref('pauseWhileTyping', e.target.checked) }),
      h('span', {}, 'Pause the video while typing a note'),
    ),
  );
}

function privacySection() {
  return section(
    'privacy',
    'About private notes',
    h('p', { class: 'muted' }, 'Private notes and private videos are hidden from the public site\u2019s interface, but they are not secret. They stay in the JSON files that GitHub Pages serves, so anyone who opens those files can read them. Keep truly sensitive notes out of the repository.'),
  );
}
