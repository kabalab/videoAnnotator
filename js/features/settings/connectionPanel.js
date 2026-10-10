import { fill, h, plural } from '../../core/dom.js';
import { store, state, editorCodeMatches, grantEditorSession, revokeEditorSession } from '../../core/store.js';
import { publicPreviewUrl } from '../../core/env.js';
import { getPref, setPref } from '../../core/prefs.js';
import * as repo from '../../data/repository.js';
import { openModal, confirmDanger } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { icon } from '../../ui/icons.js';
import { renderIssues, collectIssues } from './issuesPanel.js';
import { summarizeDraft } from './draftReview.js';

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

async function signInAction(code) {
  if (!editorCodeMatches(code)) {
    toast('That code is not right.', { kind: 'error' });
    return;
  }
  grantEditorSession();
  try {
    await repo.loadAll();
    toast('Signed in. Editing stays on in this browser.', { kind: 'success' });
  } catch (e) {
    toast(e.message, { kind: 'error', duration: 8000 });
  }
}

async function signOutAction() {
  revokeEditorSession();
  try {
    await repo.loadAll();
    toast('Signed out.', { kind: 'info' });
  } catch (e) {
    toast(e.message, { kind: 'error', duration: 8000 });
  }
}

async function copyChangeCode() {
  let code = '';
  try {
    code = repo.exportChangeCode();
  } catch (e) {
    toast(e.message, { kind: 'error', duration: 6000 });
    return;
  }
  const box = document.querySelector('[data-change-code="export"]');
  if (box) {
    box.hidden = false;
    box.value = code;
    box.focus();
    box.select();
  }
  try {
    await navigator.clipboard.writeText(code);
    toast('Change code copied.', { kind: 'success' });
  } catch {
    toast('Clipboard is blocked. Select the code below and copy it.', { kind: 'warning', duration: 6000 });
  }
}

async function importChangeCode(value) {
  try {
    const count = await repo.importChangeCode(value);
    const wrote = state.persistence.kind === 'fsa-connected';
    toast(wrote ? `Imported ${plural(count, 'file')} and wrote them to the project.` : `Imported ${plural(count, 'file')}. They are applied in this browser.`, { kind: 'success', duration: 5000 });
  } catch (e) {
    toast(e.message, { kind: 'error', duration: 8000 });
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
  for (const e of ['persistence', 'drafts', 'issues', 'data', 'descriptors', 'mode', 'prefs']) offs.push(store.on(e, render));
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
  } else if (state.editorSession) {
    out.push(draftsSection(), issuesSection(), preferencesSection());
  } else {
    out.push(editorAccessSection());
  }
  out.push(privacySection());
  return out;
}

function environmentSection() {
  const env = state.env;
  const where = env.hostname || 'file';
  const rule = `${where} \u00b7 matched rule: ${env.rule}`;
  const session = !!state.editorSession;
  let tone = 'idle';
  let title = 'Public site: read-only';
  let detail = rule;
  if (env.isLocal) {
    tone = 'ok';
    title = 'Running locally: editing is available';
  } else if (session) {
    tone = 'ok';
    title = 'Signed in: editing is on in this browser';
    detail = `${rule}. Folder linking stays off on the public site.`;
  } else if (env.previewPublic) {
    detail = `${rule}. This tab is a local preview of that read-only view. Sign in below with the editor code, the same as on the public site.`;
  }
  return section(
    'environment',
    'Environment',
    statusLine(tone, title, detail),
    env.isLocal &&
      h(
        'div',
        { class: 'settings-actions' },
        h('a', { class: 'btn btn-secondary btn-sm', href: publicPreviewUrl(), target: '_blank', rel: 'noopener' }, icon('eye'), 'Preview public site'),
        h('span', { class: 'muted' }, 'Opens a tab showing exactly what GitHub Pages visitors see.'),
      ),
    session && h('div', { class: 'settings-actions' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: signOutAction }, 'Sign out')),
  );
}

function editorAccessSection() {
  const input = h('input', {
    class: 'input',
    type: 'password',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'Editor code',
    'aria-label': 'Editor code',
  });
  const submit = () => signInAction(input.value);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  return section(
    'editor-access',
    'Editor access',
    h('p', { class: 'muted' }, 'Enter the editor code to turn on editing in this browser. You stay signed in on this site. Folder linking stays off.'),
    input,
    h('div', { class: 'settings-actions' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: submit }, 'Sign in')),
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

const reviewCache = new Map();

function reviewNames() {
  return {
    videoTitle: (id) => state.videos.get(id)?.title || id,
    tagName: (id) => state.descriptors.tags.find((t) => t.id === id)?.name || id,
    markerName: (id) => state.descriptors.markers.find((m) => m.id === id)?.name || id,
  };
}

function ensureReviews(drafts) {
  const live = new Set(drafts.map((d) => d.path));
  for (const path of [...reviewCache.keys()]) if (!live.has(path)) reviewCache.delete(path);
  for (const d of drafts) {
    const hit = reviewCache.get(d.path);
    if (hit && hit.savedAt === d.savedAt) continue;
    reviewCache.set(d.path, { savedAt: d.savedAt, status: 'loading' });
    loadReview(d);
  }
}

async function loadReview(draft) {
  const savedAt = draft.savedAt;
  try {
    const savedText = await repo.readProjectText(draft.path);
    const current = reviewCache.get(draft.path);
    if (!current || current.savedAt !== savedAt) return;
    reviewCache.set(draft.path, { savedAt, status: 'ready', savedText });
  } catch (e) {
    const current = reviewCache.get(draft.path);
    if (!current || current.savedAt !== savedAt) return;
    reviewCache.set(draft.path, { savedAt, status: 'error', message: e.message || 'Could not read the project file.' });
  }
  paintReview(draft);
}

function paintReview(draft) {
  const row = document.querySelector(`[data-draft-path="${CSS.escape(draft.path)}"]`);
  if (!row) return;
  const review = reviewFor(draft);
  const meta = row.querySelector('[data-draft-meta]');
  if (meta) meta.textContent = draftMeta(draft, review);
  const body = row.querySelector('[data-draft-review]');
  if (body) fill(body, draftReviewList(review));
}

function reviewFor(draft) {
  const hit = reviewCache.get(draft.path);
  if (!hit || hit.status === 'loading') return { status: 'loading' };
  if (hit.status === 'error') return hit;
  return { status: 'ready', items: summarizeDraft(draft.path, draft, hit.savedText, reviewNames()) };
}

function reviewCounts(items) {
  const added = items.filter((i) => i.kind === 'added').length;
  const changed = items.filter((i) => i.kind === 'changed').length;
  const removed = items.filter((i) => i.kind === 'removed').length;
  return [
    added && `${added} added`,
    changed && `${changed} changed`,
    removed && `${removed} removed`,
  ].filter(Boolean).join(', ');
}

function draftMeta(draft, review) {
  const when = new Date(draft.savedAt).toLocaleString();
  const base = draft.deleted ? ` \u00b7 delete this file \u00b7 ${when}` : ` \u00b7 ${when}`;
  if (review.status === 'loading') return `${base} \u00b7 checking what isn\u2019t saved`;
  if (review.status !== 'ready') return base;
  const counts = reviewCounts(review.items);
  return counts ? `${base} \u00b7 ${counts}` : base;
}

function draftReviewList(review) {
  if (review.status === 'loading') return h('p', { class: 'muted draft-review-status' }, 'Checking what was added and what still isn\u2019t saved\u2026');
  if (review.status === 'error') return h('p', { class: 'muted draft-review-status' }, review.message);
  return h(
    'ul',
    { class: 'draft-changes' },
    review.items.map((item) =>
      h(
        'li',
        { class: `draft-change draft-${item.kind}` },
        h(
          'div',
          { class: 'draft-change-head' },
          h('span', { class: 'draft-change-kind' }, item.kind === 'added' ? 'Added' : item.kind === 'removed' ? 'Removed' : 'Changed'),
          h('span', {}, item.title),
        ),
        item.lines?.map((line) => h('p', { class: 'draft-change-line' }, line)),
        item.text != null && h('p', { class: 'draft-change-label' }, item.savedText != null ? 'Not saved' : 'Note text'),
        item.text != null && h('pre', { class: 'draft-change-text' }, item.text || '(empty)'),
        item.savedText != null && h('p', { class: 'draft-change-label' }, 'In the project file'),
        item.savedText != null && h('pre', { class: 'draft-change-text' }, item.savedText || '(empty)'),
      ),
    ),
  );
}

function draftsSection() {
  const drafts = state.drafts;
  ensureReviews(drafts);
  const connected = state.persistence.kind === 'fsa-connected';
  const remote = !state.env.isLocal;
  const importBox = h('textarea', {
    class: 'input textarea mono change-code',
    rows: '3',
    spellcheck: 'false',
    placeholder: 'Paste a change code',
    'aria-label': 'Change code to import',
  });
  return section(
    'drafts',
    drafts.length ? `Unsaved drafts (${drafts.length})` : 'Unsaved drafts',
    h(
      'p',
      { class: 'muted' },
      remote
        ? 'Changes stay in this browser. Each file below lists what was added and what still differs from the saved copy. Copy a change code to move them, or paste a code to reapply them here. A project folder cannot be connected from the public site.'
        : 'These changes are only stored in this browser. Each file below lists what was added and what still differs from the project copy. Downloaded files land in your Downloads folder: move each one to the path shown, replacing the old file. A draft clears itself once the project file matches it.',
    ),
    drafts.length
      ? h(
          'ul',
          { class: 'draft-list' },
          drafts.map((d) => {
            const review = reviewFor(d);
            return h(
              'li',
              { class: 'draft', dataset: { draftPath: d.path } },
              h(
                'div',
                { class: 'draft-row' },
                h('div', {}, h('code', {}, d.path), h('span', { class: 'muted', dataset: { draftMeta: '' } }, draftMeta(d, review))),
                d.deleted ? h('span', { class: 'muted' }, 'Remove manually') : h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => repo.downloadDraft(d.path) }, icon('download'), 'Download'),
              ),
              h('div', { dataset: { draftReview: '' } }, draftReviewList(review)),
            );
          }),
        )
      : h('p', { class: 'muted' }, 'None right now.'),
    drafts.length
      ? h(
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
        )
      : null,
    h('p', { class: 'settings-subhead' }, 'Change code'),
    h('p', { class: 'muted' }, 'Copy a code for every unsaved change. Paste it later, in this browser or another one, to reapply those changes. Other drafts are left as they are. If a project folder is connected, importing also writes the files.'),
    h(
      'div',
      { class: 'settings-actions' },
      h('button', { class: 'btn btn-secondary btn-sm', type: 'button', disabled: !drafts.length, onclick: copyChangeCode }, 'Copy change code'),
    ),
    h('textarea', {
      class: 'input textarea mono change-code',
      rows: '4',
      readonly: true,
      hidden: true,
      spellcheck: 'false',
      'aria-label': 'Exported change code',
      dataset: { changeCode: 'export' },
    }),
    importBox,
    h('div', { class: 'settings-actions' }, h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => importChangeCode(importBox.value) }, 'Import change code')),
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
    h(
      'label',
      { class: 'check' },
      h('input', {
        type: 'checkbox',
        checked: getPref('hideWarnings'),
        onchange: (e) => {
          setPref('hideWarnings', e.target.checked);
          store.emit('prefs');
        },
      }),
      h('span', {}, 'Hide warning notices'),
    ),
    h('p', { class: 'muted' }, 'Hides messages such as a note saved only in this browser, not saved, and can\u2019t find the local file. Unsaved drafts stay listed here in Settings.'),
  );
}

function privacySection() {
  return section(
    'privacy',
    'About private notes',
    h('p', { class: 'muted' }, 'Private notes and private videos are hidden from the public site\u2019s interface, but they are not secret. They stay in the JSON files that GitHub Pages serves, so anyone who opens those files can read them. Keep truly sensitive notes out of the repository.'),
  );
}
