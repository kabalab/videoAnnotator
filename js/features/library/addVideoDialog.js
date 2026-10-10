import { h, autoGrow } from '../../core/dom.js';
import { state, listVideos } from '../../core/store.js';
import { navigate } from '../../core/router.js';
import * as repo from '../../data/repository.js';
import { openModal, confirmDanger } from '../../ui/modal.js';
import { segmented } from '../../ui/segmented.js';
import { toast } from '../../ui/toast.js';
import { icon } from '../../ui/icons.js';
import { openSettings } from '../settings/connectionPanel.js';
import { parseYouTubeId, youtubeThumbnail, youtubeWatchUrl } from './youtubeUrl.js';
import { formatTime } from '../../core/time.js';
import { attachComposerHighlight, watchTimeTokens } from '../video/composerLinks.js';
import { matchNoteRef } from '../video/noteRefs.js';
import { attachMentionMenu } from '../video/mentionMenu.js';
import { bindTextIndent } from '../../core/markup.js';

function titleFromFile(path) {
  const base = String(path || '').split('/').pop().replace(/\.[^.]+$/, '');
  const words = base.replace(/[-_.]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

function formatBytes(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}

function field(label, control, hint, extraClass = '') {
  return h('label', { class: `field ${extraClass}`.trim() }, h('span', { class: 'field-label' }, label), control, hint);
}

export function openAddVideoDialog(preset = {}) {
  return openVideoDialog({ mode: 'add', preset });
}

// Shared by Add and Edit (editVideoDialog.js).
export function openVideoDialog({ mode, video = null, preset = {}, getCurrentTime = null }) {
  const isEdit = mode === 'edit';
  const init = isEdit
    ? { title: video.title, description: video.description, visibility: video.visibility, local: video.sources.local, noFile: !!video.sources.noFile, youtube: video.sources.youtube, offsetSeconds: video.sources.offsetSeconds || 0 }
    : { title: preset.title || titleFromFile(preset.local), description: '', visibility: 'public', local: preset.local || '', noFile: false, youtube: '', offsetSeconds: 0 };
  const connected = repo.isConnected();
  let copying = null;

  // ---- basics
  const titleInput = h('input', { class: 'input', value: init.title, placeholder: 'e.g. Lecture 4: Sorting algorithms', maxlength: '200' });
  const descInput = h('textarea', {
    id: 'video-description',
    class: 'input textarea',
    rows: '3',
    placeholder: 'What is this video about? Type @ for a time or a note, or # to link another video. Leave a blank line between paragraphs.',
  });
  descInput.value = init.description;
  bindTextIndent(descInput);
  const fitDesc = autoGrow(descInput, 260);
  const openedAt = (() => {
    const t = getCurrentTime?.();
    return Number.isFinite(t) ? t : null;
  })();
  const descNotes = () => (isEdit ? video.notes : []);
  const descHint = isEdit
    ? 'Type @ to link a timestamp or general note, @now or @10:40 for a time you can click, or # to link another video. $ makes a line bigger. **bold**, __underline__, ~~italic~~, ^^exponent^^, %%lower%%. Tab indents.'
    : 'Leave a blank line between paragraphs. Type @10:40 for a time you can click, or #Lecture to link another video. $ makes a line bigger. **bold**, __underline__, ~~italic~~, ^^exponent^^, %%lower%%. Tab indents.';
  const descHighlight = attachComposerHighlight(descInput, () => ({ notes: descNotes(), videos: listVideos() }));
  const descTimes = watchTimeTokens(descInput, {
    getSeconds: () => (openedAt == null ? 0 : openedAt),
    keepNow: (value, index) => {
      if (openedAt == null) return true;
      const ref = matchNoteRef(value.slice(index), descNotes());
      return ref?.kind === 'title' && value.slice(index, index + ref.length).toLowerCase() === '@now';
    },
    grow: fitDesc,
  });
  const descMenu = attachMentionMenu(descInput, {
    getNotes: descNotes,
    getVideos: () => listVideos(),
    sigils: '@#',
    includeNow: openedAt == null ? null : () => `@${formatTime(openedAt)}`,
  });
  descHighlight.refresh();
  const descField = h(
    'div',
    { class: 'field' },
    h('label', { class: 'field-label', for: 'video-description' }, 'Description'),
    descHighlight.el,
    descMenu,
    h('span', { class: 'field-hint' }, descHint),
  );
  const idHint = h('span', { class: 'field-hint' });
  const updateIdHint = () => {
    if (isEdit) idHint.textContent = `Stored in data/videos/${video.id}.json`;
    else idHint.textContent = titleInput.value.trim() ? `Will be saved as data/videos/${repo.suggestVideoId(titleInput.value)}.json` : '';
  };
  titleInput.addEventListener('input', updateIdHint);
  updateIdHint();

  // ---- local file
  const NO_FILE = '__no-file__';
  let noFile = !!init.noFile;
  const localInput = h('input', { class: 'input mono', value: noFile ? '' : init.local, placeholder: 'videos/my-video.mp4', spellcheck: 'false', 'data-no-text-command': 'true', disabled: noFile });
  const fileSelect = h(
    'select',
    { class: 'input', 'aria-label': 'Choose a file from the videos folder' },
    h('option', { value: '' }, 'Choose a file in videos/\u2026'),
    h('option', { value: NO_FILE }, 'No file'),
  );
  const fileInput = h('input', { type: 'file', accept: 'video/*,.mkv', hidden: true });
  const progressBar = h('div', { class: 'progress-bar' });
  const progressText = h('span', { class: 'progress-text' });
  const progress = h(
    'div',
    { class: 'progress', hidden: true },
    h('div', { class: 'progress-track' }, progressBar),
    h('div', { class: 'progress-row' }, progressText, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => copying?.abort() }, 'Cancel')),
  );

  if (noFile) fileSelect.value = NO_FILE;
  if (connected) {
    repo.listVideoFiles().then((files) => {
      for (const f of files) fileSelect.append(h('option', { value: `videos/${f.name}` }, f.name));
      if (!files.length) fileSelect.options[0].textContent = 'No video files in videos/ yet';
      if (noFile) fileSelect.value = NO_FILE;
      else if (init.local && localInput.value === init.local && [...fileSelect.options].some((o) => o.value === init.local)) fileSelect.value = init.local;
    });
  } else if (noFile) fileSelect.value = NO_FILE;
  fileSelect.addEventListener('change', () => {
    if (fileSelect.value === NO_FILE) {
      setNoFile(true);
      return;
    }
    setNoFile(false);
    if (!fileSelect.value) return;
    localInput.value = fileSelect.value;
    if (!titleInput.value.trim()) {
      titleInput.value = titleFromFile(fileSelect.value);
      updateIdHint();
    }
    updatePublicHint();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    copying = new AbortController();
    progress.hidden = false;
    saveBtn.disabled = true;
    progressBar.style.width = '0%';
    progressText.textContent = `Copying ${file.name}\u2026`;
    try {
      const path = await repo.copyVideoIntoProject(file, {
        signal: copying.signal,
        onProgress: (fraction, written, total) => {
          progressBar.style.width = `${(fraction * 100).toFixed(1)}%`;
          progressText.textContent = `${Math.floor(fraction * 100)}% \u00b7 ${formatBytes(written)} of ${formatBytes(total)}`;
        },
      });
      setNoFile(false);
      localInput.value = path;
      if ([...fileSelect.options].some((o) => o.value === path)) fileSelect.value = path;
      if (!titleInput.value.trim()) {
        titleInput.value = titleFromFile(path);
        updateIdHint();
      }
      toast(`Copied into ${path}`, { kind: 'success' });
    } catch (e) {
      toast(e.name === 'AbortError' ? 'Copy cancelled' : `Copy failed: ${e.message}`, { kind: e.name === 'AbortError' ? 'info' : 'error', duration: 6000 });
    } finally {
      copying = null;
      progress.hidden = true;
      saveBtn.disabled = false;
      updatePublicHint();
    }
  });

  const copyBtn = h('button', { class: 'btn btn-secondary', type: 'button', disabled: noFile, onclick: () => fileInput.click(), title: 'Streams a copy into the project\u2019s videos folder. Large files take a while; copying them in File Explorer is faster.' }, icon('upload'), 'Copy a file in\u2026');
  const localHint = h('span', { class: 'field-hint' });
  function syncLocalHint() {
    localHint.textContent = noFile
      ? 'No local file will be connected to this video.'
      : 'Path inside the project. Local files never go to GitHub (videos/ is git-ignored). Choose No file if there will never be one.';
  }
  syncLocalHint();
  const localTools = connected
    ? h('div', { class: 'field-row' }, fileSelect, copyBtn, fileInput)
    : h(
        'div',
        {},
        fileSelect,
        h(
          'p',
          { class: 'field-hint' },
          'Put the file in the project\u2019s videos folder and type its name above, or choose No file. ',
          state.env.isLocal && state.persistence.kind !== 'fallback' && h('button', { class: 'link-btn', type: 'button', onclick: () => openSettings({ focus: 'folder' }) }, 'Connect the project folder'),
          state.env.isLocal && state.persistence.kind !== 'fallback' && ' to browse or copy files from here.',
        ),
      );

  function setNoFile(on) {
    noFile = on;
    localInput.disabled = on;
    copyBtn.disabled = on;
    if (on) {
      localInput.value = '';
      fileSelect.value = NO_FILE;
    } else if (fileSelect.value === NO_FILE) fileSelect.value = '';
    syncLocalHint();
    updatePublicHint();
    updateYt();
  }

  // ---- backup YouTube link
  const ytInput = h('input', { class: 'input', value: init.youtube ? youtubeWatchUrl(init.youtube) : '', placeholder: 'https://www.youtube.com/watch?v=\u2026 or youtu.be/\u2026', spellcheck: 'false', 'data-no-text-command': 'true' });
  const ytStatus = h('span', { class: 'field-hint' });
  const ytPreview = h('div', { class: 'yt-preview', hidden: true });
  const offsetInput = h('input', { class: 'input', type: 'number', step: '0.1', value: String(init.offsetSeconds), 'aria-label': 'Offset in seconds' });
  const publicHint = h('p', { class: 'field-hint hint-warning', hidden: true }, icon('youtube'), 'No backup link: this video will be hidden on the public site.');
  let testing = false;

  function renderPreview(id) {
    if (!id) {
      ytPreview.hidden = true;
      ytPreview.replaceChildren();
      testing = false;
      return;
    }
    ytPreview.hidden = false;
    const start = Math.max(0, Math.floor(Number(offsetInput.value) || 0));
    const media = testing
      ? h('iframe', {
          class: 'yt-preview-media',
          src: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&start=${start}`,
          title: 'YouTube backup test',
          allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
          allowfullscreen: true,
          referrerpolicy: 'strict-origin-when-cross-origin',
        })
      : h('img', { class: 'yt-preview-media', src: youtubeThumbnail(id), alt: 'YouTube thumbnail preview', onerror: (e) => { e.target.replaceWith(h('div', { class: 'yt-preview-media yt-preview-missing' }, 'Thumbnail unavailable')); } });
    ytPreview.replaceChildren(
      media,
      h(
        'div',
        { class: 'yt-preview-actions' },
        h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => { testing = !testing; renderPreview(id); } }, icon(testing ? 'x' : 'play'), testing ? 'Stop test' : 'Test'),
        h('a', { class: 'btn btn-ghost btn-sm', href: youtubeWatchUrl(id), target: '_blank', rel: 'noopener' }, icon('link'), 'Open on YouTube'),
      ),
    );
  }

  let lastId = null;
  function updateYt() {
    const raw = ytInput.value.trim();
    const id = raw ? parseYouTubeId(raw) : null;
    ytInput.classList.toggle('is-invalid', !!raw && !id);
    if (!raw) ytStatus.textContent = noFile ? 'This video has no local file, so this link is what plays.' : 'Used when the local file can\u2019t play, and always on the public site.';
    else if (!id) ytStatus.textContent = 'Not a recognizable YouTube link or 11-character video id.';
    else ytStatus.textContent = `Video id: ${id}`;
    if (id !== lastId) {
      testing = false;
      renderPreview(id);
      lastId = id;
    }
    updatePublicHint();
  }

  function updatePublicHint() {
    publicHint.hidden = noFile || !!ytInput.value.trim() || !localInput.value.trim();
  }

  ytInput.addEventListener('input', updateYt);
  localInput.addEventListener('input', updatePublicHint);
  updateYt();

  // ---- visibility
  const visibility = segmented({
    label: 'Visibility',
    value: init.visibility,
    options: [
      { value: 'public', label: 'Public', icon: 'eye' },
      { value: 'private', label: 'Private', icon: 'lock', title: 'Hidden on the public site. Not secret: the JSON file is still public.' },
    ],
  });

  const errorBox = h('p', { class: 'form-error', role: 'alert', hidden: true });
  function showError(message, focusEl) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    focusEl?.focus();
  }

  const form = h(
    'form',
    { class: 'form video-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
    field('Title', titleInput, idHint),
    h(
      'fieldset',
      { class: 'fieldset' },
      h('legend', {}, 'Sources'),
      field('Local file', localInput, localHint),
      localTools,
      progress,
      field('Backup YouTube link', ytInput, ytStatus),
      ytPreview,
      field('Offset (seconds)', offsetInput, h('span', { class: 'field-hint' }, 'Only if the YouTube upload starts at a different point. 5 means YouTube has 5 extra seconds at the start (its 0:15 matches the local 0:10).'), 'field-narrow'),
      publicHint,
    ),
    descField,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Visibility'), visibility.el),
    errorBox,
  );

  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => save() }, isEdit ? 'Save changes' : 'Add video');
  const removeBtn =
    isEdit &&
    h(
      'button',
      {
        class: 'btn btn-ghost btn-danger-text footer-start',
        type: 'button',
        onclick: async () => {
          const ok = await confirmDanger({
            title: 'Remove from library?',
            message: `"${video.title}" and its ${video.notes.length} notes will be removed (data/videos/${video.id}.json is deleted).`,
            detail: 'The video file itself is never deleted.',
            confirmLabel: 'Remove',
          });
          if (!ok) return;
          try {
            await repo.removeVideo(video.id);
            modal.close();
            navigate('/');
          } catch (e) {
            showError(e.message);
          }
        },
      },
      icon('trash'),
      'Remove from library',
    );

  async function save() {
    if (descInput.value !== init.description) {
      descTimes.flush();
      descHighlight.refresh();
    } else descTimes.cancel();
    errorBox.hidden = true;
    const ytRaw = ytInput.value.trim();
    const ytId = ytRaw ? parseYouTubeId(ytRaw) : '';
    if (ytRaw && !ytId) {
      showError('The backup YouTube link isn\u2019t recognizable. Paste a youtube.com or youtu.be link, or the 11-character video id.', ytInput);
      return;
    }
    const input = {
      title: titleInput.value,
      description: descInput.value,
      visibility: visibility.value,
      local: localInput.value,
      noFile,
      youtube: ytId,
      offsetSeconds: offsetInput.value,
    };
    saveBtn.disabled = true;
    try {
      if (isEdit) {
        await repo.updateVideo(video.id, input);
        modal.close();
      } else {
        const { video: added, results } = await repo.addVideo(input);
        modal.close();
        navigate(`/video/${encodeURIComponent(added.id)}`);
        if (results.some((r) => r.status === 'draft')) openSettings({ focus: 'drafts' });
      }
    } catch (e) {
      const focus = { title: titleInput, local: localInput, offset: offsetInput }[e.field];
      showError(e.message, focus);
    } finally {
      saveBtn.disabled = false;
    }
  }

  const modal = openModal({
    title: isEdit ? 'Edit video' : 'Add video',
    size: 'md',
    body: form,
    actions: [removeBtn, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => modal.close() }, 'Cancel'), saveBtn],
    onClose: () => {
      copying?.abort();
      descTimes.cancel();
    },
  });
  requestAnimationFrame(() => (init.title ? (ytInput.value ? descInput : ytInput) : titleInput).focus());
  return modal;
}
