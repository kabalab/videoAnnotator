import { h, richText } from '../../core/dom.js';
import { listVideos, showPrivate } from '../../core/store.js';
import { formatTime } from '../../core/time.js';
import { icon } from '../../ui/icons.js';
import { noteChips, privateBadge } from '../descriptors/chips.js';
import { mentionAt } from '../video/mentionLink.js';

function paragraphs(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .filter((para) => para.trim());
}

export function renderNoteItem(note, { onJump, onOpen, onVideoRef, onNote, notes = [], editable }) {
  const isTs = note.type === 'timestamp';
  const brokenTime = showPrivate() && '__originalTimestamp' in note;
  const meta = [noteChips(note), note.visibility === 'private' && privateBadge(), brokenTime && h('span', { class: 'badge badge-warning' }, icon('warning'), 'Invalid timestamp in file')].filter(Boolean);
  const parts = paragraphs(note.content);
  const renderText = (text) =>
    richText(text, {
      className: 'rich-text note-content',
      onTime: onJump ? (seconds) => onJump({ id: note.id, type: 'timestamp', timestamp: seconds }) : undefined,
      onMention: (line, index) =>
        mentionAt(line, index, {
          notes: notes.filter((item) => item.id !== note.id),
          videos: listVideos(),
          onNote,
          onVideo: onVideoRef,
        }),
    });
  const content =
    parts.length > 1 && !isTs
      ? h('div', { class: 'note-parts' }, ...parts.map((part) => h('div', { class: 'note-part' }, renderText(part))))
      : parts.length
        ? renderText(note.content)
        : null;

  const body = h(
    'div',
    { class: 'note-body' },
    note.title && h('div', { class: 'note-title' }, note.title),
    content,
    meta.length ? h('div', { class: 'note-meta' }, meta) : null,
  );

  const activate = () => (editable ? onOpen(note) : isTs && onJump(note));
  if (editable || isTs) {
    body.classList.add('is-clickable');
    body.setAttribute('role', 'button');
    body.tabIndex = 0;
    body.title = editable ? 'Edit note' : `Jump to ${formatTime(note.timestamp)}`;
    body.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      activate();
    });
    body.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === body) {
        e.preventDefault();
        e.stopPropagation();
        activate();
      }
    });
  }

  return h(
    'li',
    { class: ['note', isTs ? 'note-ts' : 'note-generic', parts.length > 1 && !isTs && 'has-parts', note.visibility === 'private' && 'is-private', editable && 'is-editable'], dataset: { id: note.id } },
    isTs && h('button', { class: 'note-time', type: 'button', title: `Jump to ${formatTime(note.timestamp)}`, onclick: () => onJump(note) }, formatTime(note.timestamp)),
    body,
    editable && h('span', { class: 'note-edit-hint', 'aria-hidden': 'true' }, icon('edit')),
  );
}
