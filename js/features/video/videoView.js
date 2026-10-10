import { config } from '../../config.js';
import { h, isTypingTarget, snippet } from '../../core/dom.js';
import { plainMarkup } from '../../core/markup.js';
import { store, state, canEdit, editorActive, getVideo, getTag } from '../../core/store.js';
import { navigate } from '../../core/router.js';
import { parseTime } from '../../core/time.js';
import { getPref } from '../../core/prefs.js';
import * as repo from '../../data/repository.js';
import { createPlayer } from '../../player/playerShell.js';
import { toast } from '../../ui/toast.js';
import { createNotesPanel } from '../notes/notesPanel.js';
import { createNoteEditor } from '../notes/noteEditor.js';
import { openEditVideoDialog } from '../library/editVideoDialog.js';
import { createVideoHeader } from './videoHeader.js';

function mountMissing(container, id) {
  const err = state.videoErrors.get(id);
  document.title = 'Video not found \u00b7 Video Annotator';
  container.append(
    h(
      'section',
      { class: 'empty-page' },
      h('h1', {}, err ? 'This video couldn\u2019t be loaded' : 'Video not found'),
      h('p', {}, err ? `${err.path}: ${err.message}` : editorActive() ? `There is no video with the id "${id}" in the library.` : 'This video doesn\u2019t exist or isn\u2019t public.'),
      h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to the library'),
    ),
  );
  return {};
}

const tickLabel = (n) => n.title || snippet(plainMarkup(n.content), 70) || 'Note';

export function mountVideoView(container, route) {
  const id = route.params.id;
  let video = getVideo(id);
  if (!video) return mountMissing(container, id);

  const page = h('div', { class: 'video-page' });
  const playerWrap = h('div', { class: 'player-wrap' });
  const lower = h('div', { class: 'video-lower' });
  const scrim = h('button', { class: 'editor-scrim', type: 'button', 'aria-label': 'Close note editor', tabindex: '-1' });
  container.append(page);

  const player = createPlayer({
    video,
    isLocal: state.env.isLocal,
    editable: canEdit(),
    startTime: parseTime(route.query.t) ?? 0,
    resolveLocalUrl: repo.resolveLocalVideoUrl,
  });
  playerWrap.append(player.el);

  function openLocalNote(note) {
    if (!note) return;
    if (note.type === 'timestamp') jumpToNote(note);
    else {
      highlightNote(note.id);
      if (!player.isImmersive()) panel.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  const header = createVideoHeader({
    onEdit: () => openEditVideoDialog(getVideo(id), { getCurrentTime: () => player.getTime() }),
    onNote: openLocalNote,
    onVideo: openVideoRef,
    onTime: (seconds) => player.jumpTo(seconds),
  });
  const panel = createNotesPanel({ onJump: jumpToNote, onOpen: openEditor, onAdd: addNote, onVideoRef: openVideoRef, onNote: openLocalNote });
  const editor = createNoteEditor({
    getCurrentTime: () => player.getTime(),
    getNotes: () => getVideo(id)?.notes || [],
    onSave: async (input) => {
      const { note } = await repo.saveNote(id, input);
      requestAnimationFrame(() => highlightNote(note.id));
    },
    onDelete: async (note) => {
      const r = await repo.deleteNote(id, note.id);
      if (!r) return;
      toast('Note deleted', {
        duration: config.undoMs,
        action: {
          label: 'Undo',
          fn: () => {
            if (canEdit()) repo.restoreNote(id, r.note, r.index).catch((e) => toast(e.message, { kind: 'error' }));
          },
        },
      });
    },
    onClose: closeEditor,
    onTypingStart: () => {
      if (getPref('pauseWhileTyping') && !player.isPaused()) player.pause();
    },
  });

  lower.append(panel.el);
  page.append(playerWrap, header.el, lower, scrim);
  scrim.addEventListener('click', () => editor.close());

  // ---- immersive overlay: the editor or a compact notes list sits inside the player
  let overlayMode = null;
  let overlayNotes = null;
  // Notes list was showing in fullscreen or theater when the editor covered it. Put back after Save or Cancel.
  let notesBehindEditor = false;
  let keepingNotes = false;

  function syncScrim() {
    page.classList.toggle('editor-docked', editor.isOpen() && !player.isImmersive());
  }

  function setOverlay(mode) {
    overlayMode = mode;
    if (mode === 'editor') player.setOverlay(editor.el);
    else if (mode === 'notes') {
      overlayNotes ||= createNotesPanel({ compact: true, onJump: jumpToNote, onOpen: openEditor, onAdd: addNote, onVideoRef: openVideoRef, onNote: openLocalNote, onClose: () => setOverlay(null) });
      overlayNotes.update(video);
      overlayNotes.setCurrentTime(player.getTime());
      player.setOverlay(overlayNotes.el);
    } else player.setOverlay(null);
    player.setNotesOpen(mode === 'notes');
    syncScrim();
  }

  function placeEditor() {
    if (keepingNotes) return;
    if (!editor.isOpen()) {
      if (overlayMode === 'editor') setOverlay(null);
      syncScrim();
      return;
    }
    if (player.isImmersive()) {
      if (overlayMode === 'notes') notesBehindEditor = true;
      else if (overlayMode !== 'editor') notesBehindEditor = false;
      setOverlay('editor');
    } else {
      if (overlayMode === 'editor') setOverlay(null);
      if (editor.el.parentNode !== lower) lower.append(editor.el);
      syncScrim();
    }
  }

  function addNote(type) {
    if (!canEdit()) return;
    const time = player.getTime();
    editor.open(null, { type, timestamp: type === 'timestamp' ? time : null, createdVideoTime: time });
    page.classList.add('editor-open');
    placeEditor();
  }

  function openEditor(note) {
    if (!canEdit()) return;
    editor.open(note);
    page.classList.add('editor-open');
    placeEditor();
  }

  function closeEditor() {
    page.classList.remove('editor-open');
    const reopen = notesBehindEditor && player.isImmersive();
    notesBehindEditor = false;
    if (reopen) keepingNotes = true;
    if (editor.el.contains(document.activeElement) && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (!reopen) {
      if (overlayMode === 'editor') setOverlay(null);
      editor.el.remove();
      syncScrim();
      return;
    }
    setOverlay('notes');
    editor.el.remove();
    syncScrim();
    requestAnimationFrame(() => {
      keepingNotes = false;
      if (editor.isOpen()) return;
      if (player.isImmersive()) setOverlay('notes');
      else if (overlayMode === 'notes') setOverlay(null);
    });
  }

  function highlightNote(noteId) {
    const inQuickNotes = player.isImmersive() && overlayMode === 'notes';
    (inQuickNotes ? overlayNotes : panel).highlight(noteId);
  }

  function jumpToNote(note) {
    if (note.type !== 'timestamp') return;
    player.jumpTo(note.timestamp);
    highlightNote(note.id);
  }

  function openVideoRef(ref) {
    const seconds = ref.note?.type === 'timestamp' ? ref.note.timestamp : ref.seconds;
    if (ref.video.id === id) {
      if (ref.note?.type === 'timestamp') jumpToNote(ref.note);
      else if (ref.note) {
        highlightNote(ref.note.id);
        panel.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (Number.isFinite(seconds)) player.jumpTo(seconds);
      return;
    }
    navigate(`/video/${encodeURIComponent(ref.video.id)}`, {
      t: Number.isFinite(seconds) ? Math.round(seconds * 10) / 10 : undefined,
      note: ref.note?.id,
    });
  }

  function updateTicks() {
    player.setTicks(
      video.notes
        .filter((n) => n.type === 'timestamp')
        .map((n) => ({ time: n.timestamp, color: getTag(n.tags[0])?.color || '#8fb0ff', label: tickLabel(n), noteId: n.id })),
    );
  }

  function render() {
    document.title = `${video.title} \u00b7 Video Annotator`;
    header.update(video);
    panel.update(video);
    overlayNotes?.update(video);
    updateTicks();
    player.setNextTick(panel.nextNote()?.id ?? null);
    if (editor.isOpen()) editor.refresh();
  }

  player.on('time', (t) => {
    panel.setCurrentTime(t);
    if (overlayMode === 'notes') overlayNotes.setCurrentTime(t);
    player.setNextTick(panel.nextNote()?.id ?? null);
  });
  player.on('ready', ({ duration, kind }) => repo.updateDuration(id, duration, kind));
  player.on('add-note', addNote);
  player.on('tick', highlightNote);
  function toggleOverlayNotes() {
    if (overlayMode === 'notes') setOverlay(null);
    else {
      if (editor.isOpen()) editor.close();
      setOverlay('notes');
    }
  }
  player.on('toggle-overlay-notes', toggleOverlayNotes);
  player.on('immersive', (on) => {
    if (!on && overlayMode === 'notes' && !keepingNotes) setOverlay(null);
    placeEditor();
  });
  player.on('edit-video', () => openEditVideoDialog(getVideo(id), { getCurrentTime: () => player.getTime() }));

  const offs = [
    store.on('data', (p) => {
      if (p?.videoId && p.videoId !== id) return;
      const next = getVideo(id);
      if (!next) {
        if (p?.removed) return;
        toast('This video is no longer in the library.', { kind: 'warning' });
        navigate('/');
        return;
      }
      const sourcesChanged = JSON.stringify(next.sources) !== JSON.stringify(video.sources);
      video = next;
      render();
      if (sourcesChanged) player.reloadSources(video);
    }),
    store.on('descriptors', render),
    store.on('mode', () => {
      player.setEditable(canEdit());
      if (!canEdit() && editor.isOpen()) editor.close();
      render();
    }),
    store.on('external', () => {
      if (getVideo(id)?.sources.local) player.reloadSources(getVideo(id));
    }),
  ];

  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target) || document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t instanceof Element && t.matches('input[type="range"], select')) return;
    if (e.key === ' ' && t instanceof Element && t.closest('button, a, [role="button"]')) return;
    switch (e.key) {
      case ' ':
      case 'k':
      case 'K':
        player.togglePlay();
        break;
      case 'j':
      case 'J':
        player.seekBy(-config.player.bigSeekStep);
        break;
      case 'l':
      case 'L':
        player.seekBy(config.player.bigSeekStep);
        break;
      case 'ArrowLeft':
        player.seekBy(-config.player.seekStep);
        break;
      case 'ArrowRight':
        player.seekBy(config.player.seekStep);
        break;
      case 'n':
      case 'N':
        if (!canEdit()) return;
        addNote('timestamp');
        break;
      case 'g':
      case 'G':
        if (!canEdit()) return;
        addNote('generic');
        break;
      case 'b':
      case 'B':
        player.goBack();
        break;
      case 'f':
      case 'F':
        player.toggleImmersive();
        break;
      case 'c':
      case 'C':
        if (!player.isImmersive()) return;
        toggleOverlayNotes();
        break;
      case 'm':
      case 'M':
        player.toggleMute();
        break;
      default:
        return;
    }
    e.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  // /t \t pause or play, /q \q and /e \e step, /a \a and /d \d big step. The two characters are removed.
  const textCommands = {
    t: () => player.togglePlay(),
    q: () => player.seekBy(-config.player.seekStep),
    e: () => player.seekBy(config.player.seekStep),
    a: () => player.seekBy(-config.player.bigSeekStep),
    d: () => player.seekBy(config.player.bigSeekStep),
  };
  let applyingCommand = false;

  function commandFor(sigil, letter) {
    if (sigil !== '/' && sigil !== '\\') return null;
    return textCommands[String(letter || '').toLowerCase()] || null;
  }

  function fieldCaret(el) {
    try {
      if (typeof el.selectionStart !== 'number' || typeof el.selectionEnd !== 'number') return null;
      return { start: el.selectionStart, end: el.selectionEnd };
    } catch {
      return null;
    }
  }

  function isCommandField(el) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
    if (!isTypingTarget(el) || el.hasAttribute('data-no-text-command')) return false;
    return true;
  }

  function onTextCommand(e) {
    if (applyingCommand || e.isComposing) return;
    if (e.inputType !== 'insertText' && e.inputType !== 'insertFromPaste' && e.inputType !== 'insertFromDrop') return;
    const el = e.target;
    if (!isCommandField(el) || el.closest('.settings')) return;
    const caret = fieldCaret(el);
    if (!caret || caret.start !== caret.end || caret.start < 2) return;
    const fn = commandFor(el.value[caret.start - 2], el.value[caret.start - 1]);
    if (!fn) return;
    applyingCommand = true;
    try {
      el.setRangeText('', caret.start - 2, caret.start, 'end');
      fn();
    } finally {
      applyingCommand = false;
    }
  }

  document.addEventListener('input', onTextCommand, true);

  render();
  if (route.query.note) requestAnimationFrame(() => panel.highlight(route.query.note));

  return {
    update(r) {
      const t = parseTime(r.query.t);
      if (t != null) player.jumpTo(t);
      if (r.query.note) panel.highlight(r.query.note);
    },
    destroy() {
      offs.forEach((off) => off());
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('input', onTextCommand, true);
      player.destroy();
    },
  };
}
