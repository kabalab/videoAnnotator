import { h, autoGrow } from '../../core/dom.js';
import { getMarker, listVideos } from '../../core/store.js';
import { formatTime, parseTime } from '../../core/time.js';
import { attachComposerHighlight, watchTimeTokens } from '../video/composerLinks.js';
import { matchNoteRef } from '../video/noteRefs.js';
import { getPref, setPref } from '../../core/prefs.js';
import { icon } from '../../ui/icons.js';
import { segmented } from '../../ui/segmented.js';
import { createDescriptorPicker } from '../descriptors/descriptorPicker.js';
import { attachMentionMenu } from '../video/mentionMenu.js';
import { bindTextIndent } from '../../core/markup.js';

const LAST_MARKERS = 'lastMarkers';

function lastMarkers() {
  const raw = getPref(LAST_MARKERS);
  return (Array.isArray(raw) ? raw : []).filter((id) => getMarker(id)).slice(0, 1);
}

function rememberMarkers(ids) {
  setPref(LAST_MARKERS, ids);
}

export function createNoteEditor({ getCurrentTime, getNotes, onSave, onDelete, onClose, onTypingStart }) {
  let original = null;
  let editingId = null;
  let isNew = true;
  let open = false;
  let busy = false;
  let initialTime = null;
  let initialText = '';
  let originalContent = '';
  // Video time when a new note was opened. @now uses this, not the playhead at the keystroke.
  let createdVideoTime = null;

  const heading = h('h2', { class: 'editor-title' });
  const typeSeg = segmented({
    label: 'Note type',
    value: 'timestamp',
    size: 'sm',
    options: [
      { value: 'timestamp', label: 'Timestamp', icon: 'clock' },
      { value: 'generic', label: 'General', icon: 'note' },
    ],
    onChange: (v) => {
      if (v === 'timestamp' && !tsInput.value.trim()) useCurrentTime();
      syncType();
    },
  });

  const tsInput = h('input', { class: 'input mono ts-input', inputmode: 'decimal', placeholder: '12:43', 'aria-label': 'Timestamp', spellcheck: 'false', autocomplete: 'off' });
  const tsError = h('span', { class: 'field-error', hidden: true });
  const useCurrentTime = () => {
    initialTime = getCurrentTime();
    initialText = formatTime(initialTime);
    tsInput.value = initialText;
    tsError.hidden = true;
  };
  const tsRow = h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label' }, 'Time'),
    h('div', { class: 'field-row' }, tsInput, h('button', { class: 'btn btn-secondary btn-sm', type: 'button', title: 'Use the current video time', onclick: useCurrentTime }, icon('clock'), 'Use current time')),
    tsError,
  );

  const titleInput = h('input', { class: 'input', placeholder: 'Title (optional)', 'aria-label': 'Title (optional)', maxlength: '200' });
  const content = h('textarea', { class: 'input textarea editor-content', rows: '4', placeholder: 'Write your note\u2026 Leave a blank line to start another part.', 'aria-label': 'Note text' });
  bindTextIndent(content);
  const fit = autoGrow(content, 420);
  const highlight = attachComposerHighlight(content, () => ({
    notes: (getNotes?.() || []).filter((note) => note.id !== editingId),
    videos: listVideos(),
  }));
  const mentionMenu = attachMentionMenu(content, {
    getNotes: () => (getNotes?.() || []).filter((note) => note.id !== editingId),
    getVideos: () => listVideos(),
    sigils: '@#',
    includeNow: () => `@${formatTime(secondsForNow())}`,
  });
  const refHint = h(
    'span',
    { class: 'field-hint' },
    'Type @ to link a timestamp or general note on this video. Type #Lecture to link another video, then pick one of its timestamps or general notes. $ makes a line bigger. **bold**, __underline__, ~~italic~~, ^^exponent^^, %%lower%%. Tab indents.',
  );
  const tagPicker = createDescriptorPicker({ kind: 'tag', label: 'Tags' });
  const markerPicker = createDescriptorPicker({
    kind: 'marker',
    label: 'Marker',
    max: 1,
    onChange: (ids) => {
      if (ids.length <= 1 && formError.textContent.startsWith('A note can only have one marker')) formError.hidden = true;
    },
  });
  const visHint = h('p', { class: 'field-hint' });
  const visSeg = segmented({
    label: 'Visibility',
    value: 'public',
    size: 'sm',
    options: [
      { value: 'public', label: 'Public', icon: 'eye' },
      { value: 'private', label: 'Private', icon: 'lock' },
    ],
    onChange: () => syncVis(),
  });
  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const pauseToggle = h('input', { type: 'checkbox', checked: getPref('pauseWhileTyping'), onchange: (e) => setPref('pauseWhileTyping', e.target.checked) });

  const deleteBtn = h('button', { class: 'btn btn-ghost btn-sm btn-danger-text', type: 'button', onclick: () => remove() }, icon('trash'), 'Delete');
  const saveBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', title: 'Save (Ctrl+Enter)', onclick: () => save() }, icon('check'), 'Save');

  const el = h(
    'aside',
    { class: 'editor', 'aria-label': 'Note editor' },
    h('header', { class: 'editor-header' }, heading, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close editor (Esc)', title: 'Close (Esc)', onclick: () => close() }, icon('x'))),
    h(
      'div',
      { class: 'editor-body' },
      typeSeg.el,
      tsRow,
      titleInput,
      h('div', { class: 'field' }, highlight.el, refHint, mentionMenu),
      tagPicker.el,
      markerPicker.el,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Visibility'), visSeg.el, visHint),
      formError,
    ),
    h(
      'footer',
      { class: 'editor-footer' },
      deleteBtn,
      h('label', { class: 'check check-sm editor-pause', title: 'Pause the video when you start typing' }, pauseToggle, h('span', {}, 'Pause while typing')),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => close() }, 'Cancel'),
      saveBtn,
    ),
  );

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
  const typingStart = () => {
    pauseToggle.checked = getPref('pauseWhileTyping');
    onTypingStart?.();
  };
  content.addEventListener('focus', typingStart);
  titleInput.addEventListener('focus', typingStart);
  tsInput.addEventListener('input', () => {
    tsError.hidden = true;
  });

  function secondsForNow() {
    if (isNew && createdVideoTime != null) return createdVideoTime;
    const live = getCurrentTime();
    return Number.isFinite(live) ? live : 0;
  }

  function keepNoteNamedNow(value, index) {
    const notes = (getNotes?.() || []).filter((note) => note.id !== editingId);
    const ref = matchNoteRef(value.slice(index), notes);
    return ref?.kind === 'title' && value.slice(index, index + ref.length).toLowerCase() === '@now';
  }

  const timeWatch = watchTimeTokens(content, { getSeconds: secondsForNow, keepNow: keepNoteNamedNow, grow: fit });

  function syncType() {
    const ts = typeSeg.value === 'timestamp';
    tsRow.hidden = !ts;
    content.placeholder = ts
      ? 'Write your note\u2026 Type @ to link a timestamp, or @10:40 for a time.'
      : 'Write your note\u2026 Leave a blank line to start another part. Type @ to link a timestamp, @now for this moment, or @10:40 for another time.';
    if (isNew) heading.textContent = ts ? 'New timestamp note' : 'New general note';
  }

  function syncVis() {
    visHint.textContent =
      visSeg.value === 'private'
        ? 'Only shown when the site runs locally. It is still stored in the JSON file, so it isn\u2019t secret.'
        : 'Shown on the public site too.';
    el.classList.toggle('is-private', visSeg.value === 'private');
  }

  function showError(message, field) {
    if (field === 'timestamp') {
      tsError.textContent = message;
      tsError.hidden = false;
      tsInput.focus();
      return;
    }
    formError.textContent = message;
    formError.hidden = false;
    if (field === 'content') content.focus();
  }

  async function save() {
    if (busy) return;
    if (isNew || content.value !== originalContent) {
      timeWatch.flush();
      highlight.refresh();
    }
    formError.hidden = true;
    const type = typeSeg.value;
    let timestamp = null;
    if (type === 'timestamp') {
      const text = tsInput.value.trim();
      timestamp = text === initialText && initialTime != null ? initialTime : parseTime(text);
      if (timestamp == null) {
        showError('Enter a time like 12:43, 1:02:03 or a number of seconds.', 'timestamp');
        return;
      }
    }
    const input = {
      ...(original || {}),
      type,
      timestamp,
      title: titleInput.value,
      content: content.value,
      tags: tagPicker.value,
      markers: markerPicker.value,
      visibility: visSeg.value,
    };
    busy = true;
    saveBtn.disabled = true;
    try {
      await onSave(input);
      rememberMarkers(input.markers);
      close();
    } catch (e) {
      showError(e.message, e.field);
    } finally {
      busy = false;
      saveBtn.disabled = false;
    }
  }

  async function remove() {
    if (busy || !original) return;
    busy = true;
    try {
      await onDelete(original);
      close();
    } catch (e) {
      showError(e.message);
    } finally {
      busy = false;
    }
  }

  function close() {
    if (!open) return;
    timeWatch.cancel();
    open = false;
    el.classList.remove('is-open');
    onClose?.();
  }

  return {
    el,
    isOpen: () => open,
    isEditing: (noteId) => open && original?.id === noteId,
    open(existing, defaults = {}) {
      timeWatch.cancel();
      original = existing ? { ...existing } : null;
      editingId = existing?.id || null;
      isNew = !existing;
      const base = existing || {
        type: defaults.type || 'generic',
        timestamp: defaults.timestamp ?? null,
        title: '',
        content: '',
        tags: [],
        markers: lastMarkers(),
        visibility: 'public',
      };
      heading.textContent = 'Edit note';
      typeSeg.set(base.type);
      const startedAt = defaults.createdVideoTime ?? getCurrentTime();
      createdVideoTime = existing ? null : Number.isFinite(startedAt) ? startedAt : 0;
      initialTime = base.type === 'timestamp' ? base.timestamp : null;
      initialText = initialTime != null ? formatTime(initialTime) : '';
      tsInput.value = initialText;
      tsError.hidden = true;
      titleInput.value = base.title || '';
      originalContent = base.content || '';
      content.value = originalContent;
      tagPicker.setValue(base.tags);
      markerPicker.setValue(base.markers);
      visSeg.set(base.visibility);
      deleteBtn.hidden = isNew;
      formError.hidden = true;
      highlight.refresh();
      if (base.markers.length > 1) showError('A note can only have one marker. Remove the extras before saving.');
      pauseToggle.checked = getPref('pauseWhileTyping');
      syncType();
      syncVis();
      open = true;
      el.classList.add('is-open');
      requestAnimationFrame(() => {
        fit();
        content.focus({ preventScroll: true });
        content.setSelectionRange(content.value.length, content.value.length);
      });
    },
    close,
    refresh() {
      tagPicker.refresh();
      markerPicker.refresh();
    },
  };
}
