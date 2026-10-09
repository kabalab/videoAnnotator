import { h } from '../core/dom.js';
import { config } from '../config.js';
import { store, state, canEdit, editorActive } from '../core/store.js';
import { openModal } from './modal.js';

const big = config.player.bigSeekStep;
const step = config.player.seekStep;

function show(when) {
  if (when === 'edit') return canEdit();
  if (when === 'view') return editorActive() && !canEdit();
  if (when === 'public') return !editorActive();
  return true;
}

function lead() {
  if (!editorActive()) return 'This is a read-only public view. Private videos and notes are hidden.';
  if (!state.env?.isLocal) {
    if (canEdit()) return 'You are signed in on the public site. Editing is on, and changes stay in this browser until you copy a change code. Folder linking is off.';
    return 'You are signed in on the public site. View mode is on, so adding and editing are hidden. Private notes still show. Folder linking is off.';
  }
  if (canEdit()) return 'Editing is on. You can add and change notes, tags, and markers.';
  return 'View mode is on. Adding and editing are hidden. Private notes still show.';
}

const GUIDE = [
  { text: 'The Library lists every video. Open one to watch it and read its notes.' },
  { text: 'Search looks through titles, descriptions, notes, tags, and markers.' },
  { text: 'Timestamp notes belong to a moment. Click the time to jump there. Go back returns you to where you were before the jump.' },
  { text: 'On the Timeline, the note you have reached is highlighted, and the next one is marked so you can see what is coming, including on the seek bar.' },
  { text: 'General notes are about the whole video, such as a summary or context.' },
  { text: 'In a video description, @0:25 links the note at that time and shows its title. @Summary links a note by its title. Click either one to go to that note.' },
  { when: 'edit', text: 'In a general note, @now inserts the time you started the note, and @10:40 inserts a time you can click.' },
  { text: 'Fullscreen keeps a notes panel beside the video, or along the bottom when the player is narrow. If the browser blocks fullscreen, theater mode fills the window instead.' },
  { text: 'The Tags page lists every note with that tag across all videos.' },
  { text: 'The Markers page lists every note from a viewing session across all videos.' },
  { when: 'edit', text: 'Use Timestamp or Note to add a note at the current time or for the whole video.' },
  { when: 'edit', text: 'Tags are colored labels. Markers are viewing sessions, such as a first watch. Each timestamp or general note can have one marker. The tag button in the top bar manages both.' },
  { when: 'edit', text: 'Edit video changes the title, description, and sources, including the YouTube backup.' },
  { when: 'edit', text: 'Deleting a note shows Undo for a few seconds. The file is updated immediately, and Undo writes the note back.' },
  { when: 'edit', text: 'Settings connects the project folder so changes save directly. If that is not available, edits stay in this browser as drafts you can download or copy as a change code.' },
  { when: 'view', text: 'Click a timestamp to jump to that moment. Switch to Edit in the top bar when you want to change notes.' },
  { when: 'public', text: 'Click a timestamp to jump to that moment. Nothing on this site can be edited.' },
];

const SHORTCUTS = [
  { keys: [['Space'], ['K']], action: 'Play or pause' },
  { keys: [['J'], ['L']], action: `Back or forward ${big} seconds` },
  { keys: [['\u2190'], ['\u2192']], action: `Back or forward ${step} seconds` },
  { when: 'edit', keys: [['N']], action: 'New timestamp note at the current time' },
  { when: 'edit', keys: [['G']], action: 'New general note' },
  { keys: [['B']], action: 'Go back to where you were before the last jump' },
  { keys: [['F']], action: 'Fullscreen, or theater mode if fullscreen is blocked' },
  { keys: [['C']], action: 'Show or hide the notes panel in fullscreen or theater' },
  { keys: [['M']], action: 'Mute or unmute' },
  { keys: [['/']], action: 'Focus search (any page)' },
  { keys: [['?']], action: 'Open this help (any page)' },
  { when: 'edit', keys: [['Ctrl', 'Enter'], ['Cmd', 'Enter']], action: 'Save the note being edited' },
  { keys: [['Esc']], action: 'Close the editor, a dialog, or theater mode' },
];

function renderKeys(groups) {
  return h(
    'div',
    { class: 'help-keys' },
    groups.map((group, i) => [
      i ? h('span', { class: 'help-or', 'aria-hidden': 'true' }, '/') : null,
      h(
        'span',
        { class: 'help-combo' },
        group.map((key, j) => [j ? h('span', { class: 'help-plus', 'aria-hidden': 'true' }, '+') : null, h('kbd', {}, key)]),
      ),
    ]),
  );
}

export function renderHelp() {
  const guide = GUIDE.filter((item) => show(item.when));
  const shortcuts = SHORTCUTS.filter((item) => show(item.when));
  return [
    h('p', { class: 'help-lead' }, lead()),
    h('section', { class: 'help-section' }, h('h3', {}, 'How to use'), h('ul', { class: 'help-list' }, guide.map((item) => h('li', {}, item.text)))),
    h(
      'section',
      { class: 'help-section' },
      h('h3', {}, 'Keyboard shortcuts'),
      h(
        'div',
        { class: 'help-shortcuts' },
        shortcuts.map((item) => h('div', { class: 'help-shortcut' }, renderKeys(item.keys), h('div', { class: 'help-action' }, item.action))),
      ),
      h('p', { class: 'help-note' }, 'Shortcuts on the video page are ignored while you are typing in a text field.'),
    ),
  ];
}

let helpModal = null;

export function openHelp() {
  if (helpModal) return;
  let off = () => {};
  helpModal = openModal({
    title: 'Help',
    size: 'lg',
    className: 'help-modal',
    body: renderHelp(),
    onClose: () => {
      off();
      helpModal = null;
    },
  });
  off = store.on('mode', () => helpModal?.setBody(renderHelp()));
}
