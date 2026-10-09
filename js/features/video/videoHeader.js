import { fill, h, richText } from '../../core/dom.js';
import { canEdit, listVideos, showPrivate } from '../../core/store.js';
import { icon } from '../../ui/icons.js';
import { privateBadge } from '../descriptors/chips.js';
import { mentionAt } from './mentionLink.js';

export function createVideoHeader({ onEdit, onNote, onVideo, onTime }) {
  const el = h('section', { class: 'video-header' });
  let expanded = false;
  let current = null;

  function update(video) {
    current = video;
    const desc = (video.description || '').trim();
    const long = desc.length > 360 || desc.split(/\n\s*\n/).length > 2;
    const meta = [];
    if (showPrivate() && video.visibility === 'private') meta.push(privateBadge('Private video'));
    if (showPrivate() && !video.sources.youtube) {
      meta.push(h('span', { class: 'badge badge-warning', title: 'Add a backup YouTube link to show this video on the public site' }, icon('youtube'), 'No backup link'));
    }
    if (canEdit()) meta.push(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: onEdit }, icon('edit'), 'Edit video'));

    fill(
      el,
      h('div', { class: 'video-title-row' }, h('h1', { class: 'video-title' }, video.title), meta.length ? h('div', { class: 'video-title-meta' }, meta) : null),
      desc
        ? richText(desc, {
            className: `rich-text video-desc${long && !expanded ? ' is-clamped' : ''}`,
            onTime: onTime || undefined,
            onMention: (line, index) => mentionAt(line, index, { notes: video.notes, videos: listVideos(), onNote, onVideo }),
          })
        : null,
      desc && long
        ? h(
            'button',
            {
              class: 'link-btn',
              type: 'button',
              'aria-expanded': String(expanded),
              onclick: () => {
                expanded = !expanded;
                update(current);
              },
            },
            expanded ? 'Show less' : 'Show more',
          )
        : null,
    );
  }

  return { el, update };
}
