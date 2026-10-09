import { h, richText } from '../../core/dom.js';
import { listVideos, showPrivate } from '../../core/store.js';
import { formatTime } from '../../core/time.js';
import { icon } from '../../ui/icons.js';
import { noteChips, privateBadge } from '../descriptors/chips.js';
import { mentionAt } from '../video/mentionLink.js';

export function renderNoteItem(note, { onJump, onOpen, onVideoRef, onNote, notes = [], editable, compact = false }) {
  const isTs = note.type === 'timestamp';
  const brokenTime = showPrivate() && '__originalTimestamp' in note;
  const meta = [noteChips(note), note.visibility === 'private' && privateBadge(), brokenTime && h('span', { class: 'badge badge-warning' }, icon('warning'), 'Invalid timestamp in file')].filter(Boolean);

  const body = h(
    'div',
    { class: 'note-body' },
    note.title && h('div', { class: 'note-title' }, note.title),
    note.content.trim() &&
      richText(note.content, {
        className: `rich-text note-content${compact ? ' is-clamped' : ''}`,
        onTime: onJump ? (seconds) => onJump({ id: note.id, type: 'timestamp', timestamp: seconds }) : undefined,
        onMention: (line, index) =>
          mentionAt(line, index, {
            notes: notes.filter((item) => item.id !== note.id),
            videos: listVideos(),
            onNote,
            onVideo: onVideoRef,
          }),
      }),
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
    { class: ['note', isTs ? 'note-ts' : 'note-generic', note.visibility === 'private' && 'is-private', editable && 'is-editable'], dataset: { id: note.id } },
    isTs && h('button', { class: 'note-time', type: 'button', title: `Jump to ${formatTime(note.timestamp)}`, onclick: () => onJump(note) }, formatTime(note.timestamp)),
    body,
    editable && h('span', { class: 'note-edit-hint', 'aria-hidden': 'true' }, icon('edit')),
  );
}
