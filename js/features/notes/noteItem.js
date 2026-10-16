import { h, inlineRich, richText } from '../../core/dom.js';
import { listClips, listCollections, listVideos, showPrivate } from '../../core/store.js';
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

export function renderNoteItem(note, { onJump, onOpen, onVideoRef, onClipRef, onNote, onMakeClip, notes = [], editable }) {
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
          clips: listClips(),
          collections: listCollections(),
          onNote,
          onVideo: onVideoRef,
          onClip: onClipRef,
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
    note.title &&
      h(
        'div',
        { class: 'note-title' },
        inlineRich(note.title, {
          onTime: onJump ? (seconds) => onJump({ id: note.id, type: 'timestamp', timestamp: seconds }) : undefined,
          onMention: (line, index) =>
            mentionAt(line, index, {
              notes: notes.filter((item) => item.id !== note.id),
              videos: listVideos(),
              clips: listClips(),
              collections: listCollections(),
              onNote,
              onVideo: onVideoRef,
              onClip: onClipRef,
            }),
        }),
      ),
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

  const timeBtn = isTs && h('button', { class: 'note-time', type: 'button', title: `Jump to ${formatTime(note.timestamp)}`, onclick: () => onJump(note) }, formatTime(note.timestamp));
  const clipBtn =
    isTs &&
    editable &&
    onMakeClip &&
    h(
      'button',
      {
        class: 'note-clip',
        type: 'button',
        title: 'Make a clip from this timestamp',
        'aria-label': 'Make a clip from this timestamp',
        onclick: (e) => {
          e.stopPropagation();
          onMakeClip(note);
        },
      },
      icon('film'),
      'Clip',
    );

  return h(
    'li',
    { class: ['note', isTs ? 'note-ts' : 'note-generic', parts.length > 1 && !isTs && 'has-parts', note.visibility === 'private' && 'is-private', editable && 'is-editable'], dataset: { id: note.id } },
    timeBtn && (clipBtn ? h('div', { class: 'note-time-col' }, timeBtn, clipBtn) : timeBtn),
    body,
    editable && h('span', { class: 'note-edit-hint', 'aria-hidden': 'true' }, icon('edit')),
  );
}
