import { formatTime } from '../../core/time.js';
import { hashRefLabel, hashRefTitle, matchHashRef } from '../clips/clipRefs.js';
import { canStartMention, matchNoteRef, noteMentionText, noteRefLabel } from './noteRefs.js';

// Turns an @ or # at index into the button richText should draw.
// sigils limits which marks are links. Notes use # only, so @10:40 stays a time jump.
export function mentionAt(line, index, { notes, videos, clips, collections, onNote, onVideo, onClip, sigils = '@#' } = {}) {
  const ch = line?.[index];
  if (!ch || !sigils.includes(ch)) return null;
  if (!canStartMention(index > 0 ? line[index - 1] : '')) return null;
  if (ch === '@') {
    const ref = matchNoteRef(line.slice(index), notes);
    if (!ref) return null;
    const time = ref.note.type === 'timestamp' && ref.note.timestamp != null ? formatTime(ref.note.timestamp) : '';
    return {
      length: ref.length,
      label: ref.titleOnly ? noteRefLabel(ref.note) : noteMentionText(ref.note),
      title: time ? `Jump to ${time}` : 'Show this note',
      onClick: () => onNote?.(ref.note),
    };
  }
  const ref = matchHashRef(line.slice(index), { videos, clips, collections });
  if (!ref) return null;
  const clipLike = ref.kind === 'clip' || ref.kind === 'collection' || ref.kind === 'collection-clip';
  return {
    length: ref.length,
    label: hashRefLabel(ref),
    title: hashRefTitle(ref),
    onClick: () => (clipLike ? onClip?.(ref) : onVideo?.(ref)),
  };
}
