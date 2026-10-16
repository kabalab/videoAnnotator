import { config } from '../../config.js';
import { fill, h, inlineRich, isTypingTarget, snippet } from '../../core/dom.js';
import { bindTextIndent, plainMarkup, plainTitle } from '../../core/markup.js';
import { store, state, canEdit, getClip, getCollection, getTag, getVideo, listClips, listCollections, listVideos } from '../../core/store.js';
import { href, navigate } from '../../core/router.js';
import { formatTime, parseTime } from '../../core/time.js';
import * as repo from '../../data/repository.js';
import { createPlayer } from '../../player/playerShell.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { createDescriptorPicker } from '../descriptors/descriptorPicker.js';
import { attachComposerHighlight, watchTimeTokens } from '../video/composerLinks.js';
import { attachMentionMenu } from '../video/mentionMenu.js';
import { mentionAt } from '../video/mentionLink.js';

function isNew(route, name) {
  return route.name === name && route.params.id === 'new';
}

function tickLabel(note) {
  return note.title || snippet(plainMarkup(note.content), 70) || 'Note';
}

function ticksFor(video) {
  if (!video) return [];
  return video.notes
    .filter((note) => note.type === 'timestamp')
    .map((note) => ({ time: note.timestamp, color: getTag(note.tags[0])?.color || '#8fb0ff', label: tickLabel(note), noteId: note.id }));
}

function playableQueue(collection) {
  const out = [];
  for (const id of collection?.clipIds || []) {
    const clip = getClip(id);
    if (clip && getVideo(clip.videoId)) out.push(clip);
  }
  return out;
}

export function mountClipsView(container, route) {
  let current = route;
  let editing = isNew(route, 'clip') || isNew(route, 'collection');
  let applied = '';
  let playIndex = 0;
  let queue = [];
  let player = null;
  let playerVideoId = null;
  let draftIds = [];
  let draftKey = '';

  const playerHost = h('div', { class: 'clips-stage' });
  const listHost = h('div', { class: 'clips-side' });
  const detailHost = h('div', { class: 'clips-detail' });
  const page = h('div', { class: 'page clips-page' });
  container.append(page);

  function selectedClip() {
    if (current.name !== 'clip' || isNew(current, 'clip')) return null;
    return getClip(current.params.id);
  }

  function selectedCollection() {
    if (current.name !== 'collection' || isNew(current, 'collection')) return null;
    return getCollection(current.params.id);
  }

  function modeToken() {
    return [current.name, current.params.id || '', current.query.video || '', current.query.start || '', current.query.clip || '', editing ? 'edit' : 'watch'].join('|');
  }

  function destroyPlayer() {
    player?.destroy();
    player = null;
    playerVideoId = null;
  }

  function showPrompt(text) {
    destroyPlayer();
    playerHost.replaceChildren(h('div', { class: 'clips-prompt' }, icon('film', 'empty-icon'), h('p', {}, text)));
  }

  function ensurePlayer(video, time = 0, play = false) {
    if (!player) {
      player = createPlayer({
        video,
        isLocal: state.env.isLocal,
        editable: false,
        startTime: time,
        resolveLocalUrl: repo.resolveLocalVideoUrl,
      });
      player.on('range-end', onRangeEnd);
      player.on('span', onSpan);
      playerVideoId = video.id;
      playerHost.replaceChildren(player.el);
      if (play) player.play();
      return;
    }
    if (playerVideoId !== video.id) {
      player.loadVideo(video, { time, play });
      playerVideoId = video.id;
    }
  }

  function onRangeEnd() {
    if (editing || current.name !== 'collection') return;
    if (playIndex + 1 >= queue.length) return;
    playIndex += 1;
    const clip = queue[playIndex];
    watchClip(clip, true);
    markCollectionRows();
  }

  function onSpan({ start, end }) {
    const startInput = detailHost.querySelector('[data-clip-start]');
    const endInput = detailHost.querySelector('[data-clip-end]');
    if (startInput && document.activeElement !== startInput) startInput.value = formatTime(start);
    if (endInput && Number.isFinite(end) && document.activeElement !== endInput) endInput.value = formatTime(end);
  }

  function watchClip(clip, play) {
    const video = getVideo(clip.videoId);
    if (!video) {
      showPrompt('This clip’s video is missing.');
      return;
    }
    const switched = !player || playerVideoId !== video.id;
    ensurePlayer(video, clip.start, play);
    player.setSpan(null);
    player.setWindow({ start: clip.start, end: clip.end });
    player.setTicks(ticksFor(video));
    if (!switched) {
      player.seek(clip.start);
      if (play) player.play();
      else player.pause();
    } else if (play) player.play();
  }

  function beginEditClip(clip) {
    const videoId = clip?.videoId || current.query.video || '';
    const video = getVideo(videoId);
    const start = clip ? clip.start : parseTime(current.query.start);
    if (!video) {
      showPrompt('Choose a source video to set the clip.');
      return;
    }
    ensurePlayer(video, Number.isFinite(start) ? start : 0);
    player.setWindow(null);
    player.armStop(null);
    player.setTicks(ticksFor(video));
    player.setSpan(Number.isFinite(start) ? { start, end: clip ? clip.end : null } : null);
    if (!clip && Number.isFinite(start)) player.seek(start);
  }

  function openClipRef(ref) {
    if (ref.kind === 'collection-clip') navigate(`/collection/${encodeURIComponent(ref.collection.id)}`, { clip: ref.clip.id });
    else if (ref.kind === 'collection') navigate(`/collection/${encodeURIComponent(ref.collection.id)}`);
    else if (ref.clip) navigate(`/clip/${encodeURIComponent(ref.clip.id)}`);
  }

  function openVideoRef(ref) {
    const seconds = ref.note?.type === 'timestamp' ? ref.note.timestamp : ref.seconds;
    navigate(`/video/${encodeURIComponent(ref.video.id)}`, {
      t: Number.isFinite(seconds) ? Math.round(seconds * 10) / 10 : undefined,
      note: ref.note?.id,
    });
  }

  function mentionContext(notes) {
    return {
      notes: notes || [],
      videos: listVideos(),
      clips: listClips().filter((clip) => clip.id !== selectedClip()?.id),
      collections: listCollections().filter((collection) => collection.id !== selectedCollection()?.id),
      onNote: (note) => {
        if (!player || note.type !== 'timestamp') return;
        player.seek(note.timestamp);
      },
      onVideo: openVideoRef,
      onClip: openClipRef,
    };
  }

  function linked(text, notes) {
    const ctx = mentionContext(notes);
    return inlineRich(text, {
      onTime: (seconds) => player?.seek(seconds),
      onMention: (line, index) => mentionAt(line, index, ctx),
    });
  }

  function renderLists() {
    const clip = selectedClip();
    const collection = selectedCollection();
    const clips = listClips();
    const collections = listCollections();
    const clipRows = clips.length
      ? clips.map((item) => {
          const video = getVideo(item.videoId);
          return h(
            'a',
            {
              class: ['clips-item', current.name === 'clip' && item.id === current.params.id && 'is-active'],
              href: href(`/clip/${encodeURIComponent(item.id)}`),
            },
            h('span', { class: 'clips-item-title' }, item.title),
            h('span', { class: 'clips-item-meta' }, video ? plainTitle(video.title) : 'Missing video', ` · ${formatTime(item.start)}\u2013${formatTime(item.end)}`),
          );
        })
      : h('p', { class: 'muted clips-empty' }, 'No clips yet.');
    const collectionRows = collections.length
      ? collections.map((item) =>
          h(
            'a',
            {
              class: ['clips-item', current.name === 'collection' && item.id === current.params.id && 'is-active'],
              href: href(`/collection/${encodeURIComponent(item.id)}`),
            },
            h('span', { class: 'clips-item-title' }, item.title),
            h('span', { class: 'clips-item-meta' }, `${item.clipIds.length} ${item.clipIds.length === 1 ? 'clip' : 'clips'}`),
          ),
        )
      : h('p', { class: 'muted clips-empty' }, 'No collections yet.');
    fill(
      listHost,
      h('div', { class: 'clips-block' }, h('h2', { class: 'clips-block-title' }, 'Clips'), clipRows),
      h('div', { class: 'clips-block' }, h('h2', { class: 'clips-block-title' }, 'Collections'), collectionRows),
    );
    if (!clip && current.name === 'clip' && !isNew(current, 'clip')) return;
    if (!collection && current.name === 'collection' && !isNew(current, 'collection')) return;
  }

  function timestampRows(video) {
    const notes = (video?.notes || []).filter((note) => note.type === 'timestamp').sort((a, b) => a.timestamp - b.timestamp);
    if (!notes.length) return [h('p', { class: 'muted' }, 'This video has no timestamp notes.')];
    return notes.map((note) =>
      h(
        'button',
        {
          class: 'clips-ts',
          type: 'button',
          onclick: () => player?.seek(note.timestamp),
        },
        h('span', { class: 'clips-ts-time' }, formatTime(note.timestamp)),
        h('span', { class: 'clips-ts-title' }, tickLabel(note)),
      ),
    );
  }

  function proseField(label, value, getNotes) {
    const notesNow = () => (typeof getNotes === 'function' ? getNotes() : getNotes || []);
    const area = h('textarea', { class: 'input textarea', rows: label === 'Title' ? '1' : '4', 'aria-label': label });
    area.value = value || '';
    if (label === 'Title') {
      area.maxLength = 200;
      area.addEventListener('input', () => {
        const flat = area.value.replace(/[\r\n]+/g, ' ');
        if (flat === area.value) return;
        const pos = area.selectionStart;
        area.value = flat;
        area.setSelectionRange(pos, pos);
      });
    } else bindTextIndent(area);
    const highlight = attachComposerHighlight(area, () => ({
      notes: notesNow(),
      videos: listVideos(),
      clips: listClips(),
      collections: listCollections(),
    }));
    const menu = attachMentionMenu(area, {
      getNotes: () => notesNow(),
      getVideos: () => listVideos(),
      getClips: () => listClips(),
      getCollections: () => listCollections(),
      sigils: '@#',
      includeNow: () => `@${formatTime(player?.getTime() || 0)}`,
    });
    return {
      el: h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), highlight.el, menu),
      value: () => area.value,
      flush: label === 'Title' ? () => {} : watchTimeTokens(area, { getSeconds: () => player?.getTime() || 0 }).flush,
    };
  }

  function renderClipForm(clip) {
    const videos = listVideos();
    const startValue = clip ? formatTime(clip.start) : current.query.start ? formatTime(parseTime(current.query.start) ?? 0) : '';
    const videoSelect = h(
      'select',
      { class: 'input', 'aria-label': 'Source video', 'data-clip-video': 'true' },
      h('option', { value: '' }, 'Choose a video'),
      ...videos.map((video) => h('option', { value: video.id, selected: video.id === (clip?.videoId || current.query.video) }, plainTitle(video.title) || video.id)),
    );
    const startInput = h('input', { class: 'input mono', 'data-clip-start': 'true', value: startValue, placeholder: '1:30', 'aria-label': 'Start', spellcheck: 'false' });
    const endInput = h('input', { class: 'input mono', 'data-clip-end': 'true', value: clip ? formatTime(clip.end) : '', placeholder: '3:30', 'aria-label': 'End', spellcheck: 'false' });
    const notes = () => getVideo(videoSelect.value)?.notes || [];
    const title = proseField('Title', clip?.title || '', notes);
    const description = proseField('Description', clip?.description || '', notes);
    const tags = createDescriptorPicker({ kind: 'tag', label: 'Tags' });
    tags.setValue(clip?.tags || []);
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const tsList = h('div', { class: 'clips-ts-list', 'data-ts-list': 'true' }, ...timestampRows(getVideo(videoSelect.value)));

    function syncSpan() {
      const start = parseTime(startInput.value);
      const end = parseTime(endInput.value);
      if (!player || start == null) {
        player?.setSpan(null);
        return;
      }
      player.setSpan({ start, end: end != null && end > start ? end : null });
    }

    function usePlayhead(input) {
      if (!player) return;
      input.value = formatTime(player.getTime());
      syncSpan();
      syncSave();
    }

    videoSelect.addEventListener('change', () => {
      const video = getVideo(videoSelect.value);
      if (!video) {
        showPrompt('Choose a source video to set the clip.');
        fill(tsList, ...timestampRows(null));
        syncSave();
        return;
      }
      const start = parseTime(startInput.value);
      ensurePlayer(video, Number.isFinite(start) ? start : 0);
      player.setWindow(null);
      player.setTicks(ticksFor(video));
      syncSpan();
      fill(tsList, ...timestampRows(video));
      syncSave();
    });
    const saveBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', disabled: true, onclick: () => save() }, icon('check'), 'Save');
    function syncSave() {
      const start = parseTime(startInput.value);
      const end = parseTime(endInput.value);
      saveBtn.disabled = !videoSelect.value || start == null || !(end > start);
    }
    startInput.addEventListener('input', () => {
      syncSpan();
      syncSave();
    });
    endInput.addEventListener('input', () => {
      syncSpan();
      syncSave();
    });
    syncSave();

    async function save() {
      description.flush();
      error.hidden = true;
      try {
        const { clip: saved } = await repo.saveClip({
          id: clip?.id,
          title: title.value(),
          description: description.value(),
          videoId: videoSelect.value,
          start: startInput.value,
          end: endInput.value,
          tags: tags.value,
        });
        editing = false;
        navigate(`/clip/${encodeURIComponent(saved.id)}`, {}, { replace: true });
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
      }
    }

    async function remove() {
      const result = await repo.deleteClip(clip.id);
      if (!result) return;
      toast('Clip deleted', {
        duration: config.undoMs,
        action: {
          label: 'Undo',
          fn: () => {
            if (canEdit()) repo.restoreClip(result.clip, result.collections).catch((e) => toast(e.message, { kind: 'error' }));
          },
        },
      });
      editing = false;
      navigate('/clips');
    }

    fill(
      detailHost,
      h('h2', { class: 'clips-detail-title' }, clip ? 'Edit clip' : 'New clip'),
      title.el,
      description.el,
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Source video'), videoSelect),
      h(
        'div',
        { class: 'clips-range-fields' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Start'), startInput, h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => usePlayhead(startInput) }, 'Set start')),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'End'), endInput, h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => usePlayhead(endInput) }, 'Set end')),
      ),
      h(
        'div',
        { class: 'clips-range-actions' },
        h(
          'button',
          {
            class: 'btn btn-secondary btn-sm',
            type: 'button',
            onclick: () => {
              const start = parseTime(startInput.value);
              const end = parseTime(endInput.value);
              if (start == null || end == null || !(end > start) || !player) return;
              player.setWindow(null);
              player.armStop(end);
              player.seek(start);
              player.play();
            },
          },
          icon('play'),
          'Play clip',
        ),
      ),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Timestamp notes'), h('p', { class: 'field-hint' }, 'Click a note to move the playhead there, then set the start or end.'), tsList),
      tags.el,
      error,
      h(
        'div',
        { class: 'clips-form-actions' },
        clip && h('button', { class: 'btn btn-ghost btn-sm btn-danger-text', type: 'button', onclick: () => remove().catch((e) => toast(e.message, { kind: 'error' })) }, icon('trash'), 'Delete'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: cancelEdit }, 'Cancel'),
        saveBtn,
      ),
    );
  }

  function renderCollectionForm(collection) {
    const key = collection?.id || 'new';
    if (draftKey !== key) {
      draftKey = key;
      draftIds = [...(collection?.clipIds || [])];
    }
    const title = proseField('Title', collection?.title || '', () => []);
    const description = proseField('Description', collection?.description || '', () => []);
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const order = h('div', { class: 'clips-order' });
    const addSelect = h(
      'select',
      { class: 'input', 'aria-label': 'Clip to add' },
      ...listClips().map((clip) => h('option', { value: clip.id }, clip.title)),
    );

    function paintOrder() {
      fill(
        order,
        draftIds.length
          ? draftIds.map((id, index) => {
              const clip = getClip(id);
              const video = clip ? getVideo(clip.videoId) : null;
              const label = !clip ? 'Missing clip' : !video ? `${clip.title} (video missing)` : clip.title;
              return h(
                'div',
                { class: 'clips-order-row' },
                h('span', { class: 'clips-order-label' }, label),
                h('button', { class: 'icon-btn clips-nudge-up', type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: index === 0, onclick: () => move(index, -1) }, icon('chevronDown')),
                h('button', { class: 'icon-btn', type: 'button', title: 'Move down', 'aria-label': 'Move down', disabled: index === draftIds.length - 1, onclick: () => move(index, 1) }, icon('chevronDown')),
                h('button', { class: 'icon-btn', type: 'button', title: 'Remove', 'aria-label': 'Remove from collection', onclick: () => { draftIds.splice(index, 1); paintOrder(); } }, icon('x')),
              );
            })
          : h('p', { class: 'muted' }, 'No clips in this collection yet.'),
      );
    }

    function move(index, dir) {
      const next = index + dir;
      if (next < 0 || next >= draftIds.length) return;
      const [item] = draftIds.splice(index, 1);
      draftIds.splice(next, 0, item);
      paintOrder();
    }

    paintOrder();

    async function save() {
      description.flush();
      error.hidden = true;
      try {
        const { collection: saved } = await repo.saveCollection({
          id: collection?.id,
          title: title.value(),
          description: description.value(),
          clipIds: draftIds,
        });
        draftKey = '';
        editing = false;
        navigate(`/collection/${encodeURIComponent(saved.id)}`, {}, { replace: true });
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
      }
    }

    async function remove() {
      const result = await repo.deleteCollection(collection.id);
      if (!result) return;
      toast('Collection deleted', {
        duration: config.undoMs,
        action: { label: 'Undo', fn: () => { if (canEdit()) repo.restoreCollection(result.collection).catch((e) => toast(e.message, { kind: 'error' })); } },
      });
      editing = false;
      navigate('/clips');
    }

    fill(
      detailHost,
      h('h2', { class: 'clips-detail-title' }, collection ? 'Edit collection' : 'New collection'),
      title.el,
      description.el,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Clips, in play order'), order),
      listClips().length
        ? h(
            'div',
            { class: 'clips-add-row' },
            addSelect,
            h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => { if (addSelect.value) { draftIds.push(addSelect.value); paintOrder(); } } }, 'Add'),
          )
        : h('p', { class: 'muted' }, 'Make a clip first, then add it here.'),
      error,
      h(
        'div',
        { class: 'clips-form-actions' },
        collection && h('button', { class: 'btn btn-ghost btn-sm btn-danger-text', type: 'button', onclick: () => remove().catch((e) => toast(e.message, { kind: 'error' })) }, icon('trash'), 'Delete'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: cancelEdit }, 'Cancel'),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => save() }, icon('check'), 'Save'),
      ),
    );
  }

  function renderWatchClip(clip) {
    const video = getVideo(clip.videoId);
    fill(
      detailHost,
      h(
        'div',
        { class: 'clips-watch-head' },
        h('h2', { class: 'clips-detail-title' }, linked(clip.title, video?.notes || [])),
        canEdit() && h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => { editing = true; renderDetail(true); } }, icon('edit'), 'Edit'),
      ),
      h('p', { class: 'clips-item-meta' }, video ? plainTitle(video.title) : 'Missing video', ` · ${formatTime(clip.start)}\u2013${formatTime(clip.end)}`),
      clip.description && h('div', { class: 'clips-copy' }, linked(clip.description, video?.notes || [])),
    );
  }

  function renderWatchCollection(collection) {
    queue = playableQueue(collection);
    let seen = 0;
    const rows = (collection.clipIds || []).map((id) => {
      const clip = getClip(id);
      const video = clip ? getVideo(clip.videoId) : null;
      const missing = !clip || !video;
      const playableIndex = missing ? -1 : seen++;
      const label = !clip ? 'Missing clip' : !video ? `${clip.title} (video missing)` : clip.title;
      return h(
        'button',
        {
          class: ['clips-order-row', 'is-button', playableIndex === playIndex && !missing && 'is-current'],
          type: 'button',
          disabled: missing,
          'data-queue': missing ? '' : String(playableIndex),
          onclick: () => {
            if (missing) return;
            playIndex = playableIndex;
            watchClip(clip, true);
            markCollectionRows();
          },
        },
        h('span', { class: 'clips-order-label' }, label),
        clip && video && h('span', { class: 'clips-item-meta' }, `${formatTime(clip.start)}\u2013${formatTime(clip.end)}`),
      );
    });
    fill(
      detailHost,
      h(
        'div',
        { class: 'clips-watch-head' },
        h('h2', { class: 'clips-detail-title' }, linked(collection.title, [])),
        canEdit() && h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => { editing = true; draftKey = ''; renderDetail(true); } }, icon('edit'), 'Edit'),
      ),
      collection.description && h('div', { class: 'clips-copy' }, linked(collection.description, [])),
      h('div', { class: 'clips-order' }, rows.length ? rows : h('p', { class: 'muted' }, 'This collection has no clips.')),
    );
  }

  function markCollectionRows() {
    for (const row of detailHost.querySelectorAll('[data-queue]')) {
      row.classList.toggle('is-current', row.dataset.queue !== '' && Number(row.dataset.queue) === playIndex);
    }
  }

  function renderDetail(force) {
    const token = modeToken();
    const changed = force || token !== applied;
    if (!changed && detailHost.childElementCount) return;
    applied = token;
    const clip = selectedClip();
    const collection = selectedCollection();
    if (current.name === 'clip' && !clip && !isNew(current, 'clip')) {
      showPrompt('That clip doesn\u2019t exist or isn\u2019t available.');
      fill(detailHost, h('p', {}, 'That clip doesn\u2019t exist or isn\u2019t available.'));
      return;
    }
    if (current.name === 'collection' && !collection && !isNew(current, 'collection')) {
      showPrompt('That collection doesn\u2019t exist or isn\u2019t available.');
      fill(detailHost, h('p', {}, 'That collection doesn\u2019t exist or isn\u2019t available.'));
      return;
    }
    if (!canEdit()) editing = false;
    if (isNew(current, 'clip') || (editing && (clip || isNew(current, 'clip')))) {
      renderClipForm(clip);
      beginEditClip(clip);
      return;
    }
    if (isNew(current, 'collection') || (editing && collection)) {
      renderCollectionForm(collection);
      const first = collection ? playableQueue(collection)[0] : null;
      if (first) {
        const video = getVideo(first.videoId);
        ensurePlayer(video, first.start);
        player.setWindow(null);
        player.setSpan(null);
        player.setTicks(ticksFor(video));
      } else showPrompt('Add clips, then play the collection.');
      return;
    }
    if (clip) {
      renderWatchClip(clip);
      if (getVideo(clip.videoId)) watchClip(clip, false);
      else showPrompt('This clip’s video is missing.');
      return;
    }
    if (collection) {
      queue = playableQueue(collection);
      const wanted = current.query.clip;
      const found = queue.findIndex((item) => item.id === wanted);
      playIndex = found >= 0 ? found : 0;
      renderWatchCollection(collection);
      if (queue[playIndex]) watchClip(queue[playIndex], false);
      else showPrompt('None of the clips in this collection can be played.');
      return;
    }
    showPrompt('Pick a clip or collection.');
    fill(detailHost, h('p', { class: 'muted' }, 'Choose a clip or collection, or make a new one.'));
  }

  function cancelEdit() {
    editing = false;
    draftKey = '';
    if (isNew(current, 'clip') || isNew(current, 'collection')) navigate('/clips');
    else renderDetail(true);
  }

  function render() {
    document.title = 'Clips \u00b7 Video Annotator';
    fill(
      page,
      h(
        'header',
        { class: 'page-header' },
        h('div', {}, h('h1', { class: 'page-title' }, 'Clips'), h('p', { class: 'page-sub' }, 'Saved ranges, and collections that play them in order')),
        canEdit() &&
          h(
            'div',
            { class: 'clips-header-actions' },
            h('a', { class: 'btn btn-secondary btn-sm', href: href('/clip/new') }, icon('plus'), 'New clip'),
            h('a', { class: 'btn btn-secondary btn-sm', href: href('/collection/new') }, icon('plus'), 'New collection'),
          ),
      ),
      h('div', { class: 'clips-layout' }, listHost, h('div', { class: 'clips-main' }, playerHost, detailHost)),
    );
    renderLists();
    renderDetail(false);
  }

  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !player) return;
    if (isTypingTarget(e.target) || document.querySelector('dialog[open]')) return;
    const step = config.player.seekStep;
    const big = config.player.bigSeekStep;
    if (e.key === ' ' || e.key === 'k' || e.key === 'K') player.togglePlay();
    else if (e.key === 'j' || e.key === 'J') player.seekBy(-big);
    else if (e.key === 'l' || e.key === 'L') player.seekBy(big);
    else if (e.key === 'ArrowLeft') player.seekBy(-step);
    else if (e.key === 'ArrowRight') player.seekBy(step);
    else if (e.key === 'm' || e.key === 'M') player.toggleMute();
    else if (e.key === 'f' || e.key === 'F') player.toggleImmersive();
    else if (e.key === 'b' || e.key === 'B') player.goBack();
    else return;
    e.preventDefault();
  }

  const offs = ['data', 'clips', 'descriptors', 'mode'].map((event) =>
    store.on(event, () => {
      if (event === 'mode' && !canEdit()) editing = false;
      if (player && playerVideoId && (event === 'data' || event === 'descriptors')) {
        const playing = getVideo(playerVideoId);
        if (playing) player.setTicks(ticksFor(playing));
      }
      if (event === 'data' && editing) {
        renderLists();
        const video = getVideo(detailHost.querySelector('[data-clip-video]')?.value || '');
        if (player && video && playerVideoId === video.id) player.setTicks(ticksFor(video));
        const list = detailHost.querySelector('[data-ts-list]');
        if (list && video) fill(list, ...timestampRows(video));
        return;
      }
      if ((event === 'clips' || event === 'descriptors') && editing) {
        renderLists();
        return;
      }
      render();
    }),
  );
  document.addEventListener('keydown', onKey);
  render();

  return {
    update(next) {
      const sameClip = next.name === current.name && next.params.id === current.params.id;
      current = next;
      if (!sameClip) editing = isNew(next, 'clip') || isNew(next, 'collection');
      if (isNew(next, 'clip') || isNew(next, 'collection')) editing = true;
      render();
    },
    destroy() {
      offs.forEach((off) => off());
      document.removeEventListener('keydown', onKey);
      destroyPlayer();
    },
  };
}
