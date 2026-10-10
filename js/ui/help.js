import { h } from '../core/dom.js';
import { config } from '../config.js';
import { store, state, canEdit, editorActive } from '../core/store.js';
import { openModal } from './modal.js';

const big = config.player.bigSeekStep;
const step = config.player.seekStep;

function show(when) {
  if (!when) return true;
  if (when === 'edit') return canEdit();
  if (when === 'view') return editorActive() && !canEdit();
  if (when === 'editor') return editorActive();
  if (when === 'public') return !editorActive();
  if (when === 'local') return !!state.env?.isLocal;
  if (when === 'remote') return editorActive() && !state.env?.isLocal;
  if (when === 'readonly') return !canEdit();
  return true;
}

function lead() {
  if (!editorActive()) return 'This is a read-only public view. Private videos and notes are hidden. The Signing in tab explains how to turn editing on.';
  if (!state.env?.isLocal) {
    if (canEdit()) return 'You are signed in on the public site. Editing is on, and changes stay in this browser. Folder linking is off.';
    return 'You are signed in on the public site. View mode is on, so adding and editing are hidden. Private notes still show. Folder linking is off.';
  }
  if (canEdit()) return 'Editing is on. You can add and change notes, tags, and markers.';
  return 'View mode is on. Adding and editing are hidden. Private notes still show.';
}

function code(text) {
  return h('code', {}, text);
}

function bullets(items) {
  const shown = items.filter((item) => show(item.when));
  if (!shown.length) return null;
  return h(
    'ul',
    { class: 'help-list' },
    shown.map((item) => h('li', {}, ...(item.parts || [item.text]))),
  );
}

function block(title, items) {
  const list = bullets(items);
  if (!list) return null;
  return h('section', { class: 'help-section' }, title && h('h3', {}, title), list);
}

const WATCHING = [
  { text: 'The Library lists every video you can open. Open one to watch it and read its notes.' },
  { when: 'public', text: 'Private videos are hidden, and so is a video with no YouTube link.' },
  { text: 'Search looks through titles, descriptions, notes, tags, and markers. Filters can limit results to a video, a note type, a tag, or a marker.' },
  { when: 'editor', text: 'Search can also filter by public or private.' },
  { text: 'Timestamp notes belong to a moment. Click the time to jump there. Go back returns you to where you were before the jump.' },
  { text: 'On the Timeline, the note you have reached is highlighted, and the next one is marked so you can see what is coming, including on the seek bar.' },
  { text: 'General notes are about the whole video, such as a summary or context. A blank line splits a general note into parts.' },
  { text: 'Fullscreen keeps a notes panel beside the video, or along the bottom when the player is narrow. If the browser blocks fullscreen, theater mode fills the window instead.' },
  { when: 'view', text: 'Switch to Edit in the top bar when you want to add or change notes.' },
];

const EDITING = [
  { when: 'edit', text: 'On the Library, Add video creates a video. On a video, Edit video changes the title, description, visibility, and sources, including the YouTube backup. A video with no YouTube link is hidden on the public site.' },
  { when: 'edit', text: 'Use Timestamp or Note to add a note at the current time or for the whole video. Click a note to edit it.' },
  { when: 'edit', text: 'A note or a video can be public or private. Private items are hidden on the public site. They are not secret: they stay in the project files, so keep sensitive notes out of the project.' },
  { when: 'edit', text: 'Deleting a note shows Undo for a few seconds. The file is updated immediately, and Undo writes the note back.' },
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
  { when: 'edit', keys: [['Esc']], action: 'Close the editor, a dialog, or theater mode' },
  { when: 'readonly', keys: [['Esc']], action: 'Close a dialog or theater mode' },
];

const WHILE_TYPING = [
  { keys: [['/t'], ['\\t']], action: 'Pause or play' },
  { keys: [['/q'], ['\\q']], action: `Back ${step} seconds` },
  { keys: [['/e'], ['\\e']], action: `Forward ${step} seconds` },
  { keys: [['/a'], ['\\a']], action: `Back ${big} seconds` },
  { keys: [['/d'], ['\\d']], action: `Forward ${big} seconds` },
];

const TEXT_READING = [
  { when: 'public', text: 'Click a time in a note or a description to jump to that moment.' },
  { when: 'public', text: 'A link to another note on this video shows that note. Click it to jump to a timestamp note, or to open a general note.' },
  { when: 'public', text: 'A link to another video opens that video. It can also open a moment in it, or one of its general notes.' },
  { when: 'public', text: 'Some lines are larger than others. Text can be bold, underlined, italic, raised like an exponent, or lowered and smaller. Lines can be indented.' },
];

const TEXT_WRITING = [
  { when: 'view', text: 'View mode is on. Switch to Edit in the top bar before writing any of this.' },
  {
    when: 'editor',
    parts: [
      'In a description or a note, ',
      code('@0:25'),
      ' links the timestamp note at that time and shows its title. ',
      code('@10:40'),
      ' is a time you can click when no note is at that moment. ',
      code('@Summary'),
      ' links a general note by its title.',
    ],
  },
  {
    when: 'editor',
    parts: [
      code('#Lecture'),
      ' links another video. ',
      code('#Lecture/0:25'),
      ' opens a timestamp in it, and ',
      code('#Lecture/Summary'),
      ' opens a general note. These work in descriptions and in notes.',
    ],
  },
  {
    when: 'editor',
    parts: [
      'While writing, type ',
      code('@'),
      ' to link a note or insert a time, or ',
      code('#'),
      ' to link a video, then pick from the list. ',
      code('@now'),
      ' uses the time you started from. Arrow keys move through the list, and Tab or Enter inserts the highlighted match. A finished link or time is highlighted in the box before you save.',
    ],
  },
  {
    when: 'editor',
    parts: ['Start a line with ', code('$'), ' to make it bigger. ', code('$$'), ' is larger, and ', code('$$$'), ' is the largest.'],
  },
  {
    when: 'editor',
    parts: [code('**text**'), ' is bold. ', code('__text__'), ' is underlined. ', code('~~text~~'), ' is italic.'],
  },
  {
    when: 'editor',
    parts: [code('^^text^^'), ' raises the text, like an exponent. ', code('%%text%%'), ' lowers it and makes it smaller.'],
  },
  { when: 'editor', text: 'Tab indents while you are typing a note or a description. Shift+Tab removes one indent. Select several lines to indent them together. While a suggestion list is open, Tab picks a suggestion instead.' },
  { when: 'editor', text: 'Leave a blank line to start another part of a general note or a description.' },
  { when: 'editor', text: 'An @ or # stuck to the middle of a word is left as plain text.' },
];

const LABELS = [
  { text: 'A tag is a colored label for what a note is about, such as Important or Question. A note can have several tags.' },
  { text: 'A marker records the viewing or session a note was made in, such as a first watch. A note can have one marker, shown with a flag.' },
  { text: 'Tags describe the note. Markers describe when it was written. They are separate, and a note can have both.' },
  { text: 'The Tags page lists every note with that tag, across all videos. The Markers page lists every note from one viewing session, across all videos.' },
  { text: 'On a video, when notes use more than one tag or marker, the notes list can be filtered by them. Search can filter by them too.' },
  { when: 'view', text: 'Switch to Edit in the top bar to create or change tags and markers.' },
  { when: 'edit', text: 'The tag button in the top bar creates, renames, recolors, and deletes tags and markers.' },
  { when: 'edit', text: 'While editing a note, the tag and marker fields attach existing ones. Typing a new name can create it.' },
];

const ACCESS_PUBLIC = [
  { when: 'public', text: 'This site is read-only until you sign in. Open Settings with the gear in the top bar, enter the editor code, and choose Sign in.' },
  { when: 'public', text: 'The right code turns editing on in this browser. You stay signed in on this site until you sign out from Settings.' },
  { when: 'public', text: 'After you sign in, the top bar shows Edit and View. Edit lets you add and change notes, tags, and markers, and private videos and notes appear. View hides adding and editing. Private notes still show in View.' },
  { when: 'public', text: 'Folder linking stays off on the public site. Changes stay in this browser. Settings can copy a change code for those changes, or paste a code to reapply them.' },
];

const ACCESS_REMOTE = [
  { when: 'remote', text: 'You are signed in. Sign out from Settings to return to the read-only public view. You stay signed in on this site until then.' },
  { when: 'remote', text: 'Edit and View are in the top bar. Edit is for adding and changing notes, tags, and markers. View hides those controls. Private notes still show in both.' },
  { when: 'remote', text: 'Folder linking is off. Changes stay in this browser. In Settings, copy a change code to take them with you, or paste a code to reapply them here.' },
  { when: 'remote', text: 'Private notes and videos are hidden from people who are not signed in. They are not secret: they stay in the project files, so keep sensitive notes out of the project.' },
  { when: 'remote', text: 'Settings can pause the video while you type a note.' },
];

const ACCESS_LOCAL = [
  { when: 'local', text: 'Editing is available because this copy is running on your computer. An editor code is not required here.' },
  { when: 'local', text: 'The top bar switches between Edit and View. View hides adding and editing. Private notes still show.' },
  { when: 'local', text: 'Settings connects the project folder (the one containing index.html) so changes save directly into the files. If that is not available, edits stay in this browser as drafts you can download or copy as a change code.' },
  { when: 'local', text: 'Settings can also use a videos folder outside the project, which helps when large files should not live in OneDrive.' },
  { when: 'local', text: 'Settings can pause the video while you type a note.' },
  { when: 'local', text: 'Private notes and videos are hidden on the public site until someone signs in. They are not secret: they stay in the project files, so keep sensitive notes out of the project.' },
];

const ACCESS_PUBLIC_SITE = [
  { when: 'local', text: 'Visitors are read-only until they open Settings and enter the editor code. Signing in turns on editing in that browser only.' },
  { when: 'local', text: 'Folder linking stays off there. Their changes stay in that browser until they copy a change code. Settings on this computer can open a preview of that public view.' },
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

function watchingPanel() {
  return [block(null, WATCHING), block('Adding and editing', EDITING)];
}

function renderShortcutList(items) {
  return h(
    'div',
    { class: 'help-shortcuts' },
    items.map((item) => h('div', { class: 'help-shortcut' }, renderKeys(item.keys), h('div', { class: 'help-action' }, item.action))),
  );
}

function keyboardPanel() {
  const shortcuts = SHORTCUTS.filter((item) => show(item.when));
  return [
    h(
      'section',
      { class: 'help-section' },
      renderShortcutList(shortcuts),
      h('p', { class: 'help-note' }, 'Shortcuts on the video page are ignored while you are typing in a text field.'),
    ),
    h(
      'section',
      { class: 'help-section' },
      h('h3', {}, 'While typing'),
      h(
        'p',
        { class: 'help-tab-lead' },
        'Type these in any text field on the video page. The two characters are removed when the command runs.',
      ),
      renderShortcutList(WHILE_TYPING),
    ),
  ];
}

function textPanel() {
  return [block(null, TEXT_READING), block(null, TEXT_WRITING)];
}

function labelsPanel() {
  return [
    h('p', { class: 'help-tab-lead' }, 'Tags say what a note is about. Markers say which viewing or session it was written in.'),
    block(null, LABELS),
  ];
}

function accessPanel() {
  return [block(null, ACCESS_PUBLIC), block(null, ACCESS_REMOTE), block('On this computer', ACCESS_LOCAL), block('On the public site', ACCESS_PUBLIC_SITE)];
}

const TABS = [
  { id: 'watching', label: 'Watching', panel: watchingPanel },
  { id: 'keyboard', label: 'Keyboard', panel: keyboardPanel },
  { id: 'text', label: 'Text', panel: textPanel },
  { id: 'labels', label: 'Tags & markers', panel: labelsPanel },
  { id: 'access', label: 'Signing in', panel: accessPanel },
];

let helpTab = 'watching';
let helpModal = null;

function selectTab(id) {
  helpTab = id;
  helpModal?.setBody(renderHelp());
  requestAnimationFrame(() => document.getElementById(`help-tab-${id}`)?.focus());
}

function renderTablist() {
  const ids = TABS.map((tab) => tab.id);
  const tabs = h(
    'div',
    { class: 'tabs help-tabs', role: 'tablist', 'aria-label': 'Help topics' },
    TABS.map((tab) =>
      h(
        'button',
        {
          class: ['tab', helpTab === tab.id && 'is-active'],
          type: 'button',
          role: 'tab',
          id: `help-tab-${tab.id}`,
          'aria-selected': String(helpTab === tab.id),
          'aria-controls': 'help-panel',
          tabindex: helpTab === tab.id ? '0' : '-1',
          onclick: () => selectTab(tab.id),
        },
        tab.label,
      ),
    ),
  );
  tabs.addEventListener('keydown', (e) => {
    const i = ids.indexOf(helpTab);
    let next = null;
    if (e.key === 'ArrowRight') next = ids[(i + 1) % ids.length];
    else if (e.key === 'ArrowLeft') next = ids[(i - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    else return;
    e.preventDefault();
    selectTab(next);
  });
  return tabs;
}

export function renderHelp() {
  if (!TABS.some((tab) => tab.id === helpTab)) helpTab = TABS[0].id;
  const current = TABS.find((tab) => tab.id === helpTab);
  return [
    h('p', { class: 'help-lead' }, lead()),
    renderTablist(),
    h('div', { class: 'help-panel', id: 'help-panel', role: 'tabpanel', 'aria-labelledby': `help-tab-${helpTab}` }, current.panel()),
  ];
}

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
