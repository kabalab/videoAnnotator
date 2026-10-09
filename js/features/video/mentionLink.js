import { formatTime } from '../../core/time.js';
import { canStartMention, matchNoteRef, noteMentionText } from './noteRefs.js';
import { matchVideoRef, videoRefLabel, videoRefTitle } from './videoRefs.js';

// Turns an @ or # at index into the button richText should draw.
// sigils limits which marks are links. Notes use # only, so @10:40 stays a time jump.
export function mentionAt(line, index, { notes, videos, onNote, onVideo, sigils = '@#' } = {}) {
  const ch = line?.[index];
  if (!ch || !sigils.includes(ch)) return null;
  if (!canStartMention(index > 0 ? line[index - 1] : '')) return null;
  if (ch === '@') {
    const ref = matchNoteRef(line.slice(index), notes);
    if (!ref) return null;
    const time = ref.note.type === 'timestamp' && ref.note.timestamp != null ? formatTime(ref.note.timestamp) : '';
    return {
      length: ref.length,
      label: noteMentionText(ref.note),
      title: time ? `Jump to ${time}` : 'Show this note',
      onClick: () => onNote?.(ref.note),
    };
  }
  const ref = matchVideoRef(line.slice(index), videos);
  if (!ref) return null;
  return {
    length: ref.length,
    label: videoRefLabel(ref),
    title: videoRefTitle(ref),
    onClick: () => onVideo?.(ref),
  };
}
