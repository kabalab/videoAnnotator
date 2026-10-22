import { config } from '../../config.js';
import { autoGrow, h } from '../../core/dom.js';
import { bindTextIndent, plainTitle } from '../../core/markup.js';
import { state, getVideoFolder } from '../../core/store.js';
import { navigate } from '../../core/router.js';
import * as repo from '../../data/repository.js';
import { confirmDanger, openModal } from '../../ui/modal.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';

function containersOf(id) {
  const found = new Set();
  const seen = new Set();
  const walk = (current) => {
    if (!current || seen.has(current)) return;
    seen.add(current);
    for (const item of state.libraryFolders || []) {
      if ((item.folderIds || []).includes(current)) {
        found.add(item.id);
        walk(item.id);
      }
    }
  };
  walk(id);
  return found;
}

export function openFolderDialog(folder = null, { parentId = '' } = {}) {
  const titleInput = h('input', { class: 'input', value: folder?.title || '', placeholder: 'Folder name', maxlength: '200' });
  const descInput = h('textarea', { class: 'input textarea', rows: '3', placeholder: 'What is this folder for?' });
  descInput.value = folder?.description || '';
  bindTextIndent(descInput);
  autoGrow(descInput, 180);
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const previousVideos = folder?.videoIds || [];
  const previousFolders = folder?.folderIds || [];
  const parent = !folder && parentId ? getVideoFolder(parentId) : null;
  const blocked = containersOf(folder?.id);
  if (parent) {
    blocked.add(parent.id);
    for (const id of containersOf(parent.id)) blocked.add(id);
  }
  const videoPicks = state.libraryIds.map((id) => {
    const video = state.videos.get(id);
    const label = video ? plainTitle(video.title) || video.title || id : id;
    return h(
      'label',
      { class: 'folder-pick' },
      h('input', { type: 'checkbox', dataset: { kind: 'video' }, value: id, checked: previousVideos.includes(id) }),
      h('span', {}, label),
    );
  });
  const folderPicks = (state.libraryFolders || [])
    .filter((item) => item.id !== folder?.id)
    .map((item) => {
      const loop = blocked.has(item.id);
      const label = plainTitle(item.title) || item.title || item.id;
      const reason = !loop ? null : item.id === parent?.id ? 'This new folder is already going inside that folder.' : 'Putting that folder here would make a loop.';
      return h(
        'label',
        { class: 'folder-pick', title: reason },
        h('input', {
          type: 'checkbox',
          dataset: { kind: 'folder' },
          value: item.id,
          checked: !loop && previousFolders.includes(item.id),
          disabled: loop,
        }),
        h('span', {}, label),
      );
    });

  const m = openModal({
    title: folder ? 'Edit folder' : 'New folder',
    size: 'lg',
    body: h('div', { class: 'form' }, [
      parent && h('p', { class: 'muted' }, `This folder will be put inside ${plainTitle(parent.title) || parent.title}.`),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), titleInput),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Description'), descInput),
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'field-label' }, 'Videos'),
        videoPicks.length ? h('div', { class: 'folder-picks' }, videoPicks) : h('p', { class: 'muted' }, 'Add a video before putting one in a folder.'),
      ),
      folderPicks.length
        ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Folders'), h('div', { class: 'folder-picks' }, folderPicks))
        : null,
      error,
    ]),
    actions: [
      folder &&
        h(
          'button',
          {
            class: 'btn btn-ghost btn-danger-text',
            type: 'button',
            onclick: () => {
              remove().catch((e) => toast(e.message, { kind: 'error' }));
            },
          },
          icon('trash'),
          'Delete',
        ),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Cancel'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onclick: () => {
            save().catch((e) => {
              error.textContent = e.message;
              error.hidden = false;
            });
          },
        },
        icon('check'),
        'Save',
      ),
    ],
  });
  titleInput.focus();
  let createdId = folder?.id || '';

  function chosenIds(kind, previous, universe) {
    const checked = new Set([...m.body.querySelectorAll(`input[data-kind="${kind}"]:checked`)].map((input) => input.value));
    const kept = previous.filter((id) => checked.has(id));
    const added = universe.filter((id) => checked.has(id) && !previous.includes(id));
    return [...kept, ...added];
  }

  async function save() {
    error.hidden = true;
    const folderIds = chosenIds(
      'folder',
      previousFolders,
      (state.libraryFolders || []).map((item) => item.id),
    ).filter((id) => id !== createdId && id !== parent?.id && !blocked.has(id));
    const { folder: saved } = await repo.saveVideoFolder({
      id: createdId || undefined,
      title: titleInput.value,
      description: descInput.value,
      videoIds: chosenIds('video', previousVideos, state.libraryIds),
      folderIds,
    });
    createdId = saved.id;
    if (parent && !(getVideoFolder(parent.id)?.folderIds || []).includes(saved.id)) {
      const latest = getVideoFolder(parent.id);
      if (latest) {
        await repo.saveVideoFolder({
          id: latest.id,
          title: latest.title,
          description: latest.description,
          videoIds: latest.videoIds || [],
          folderIds: [...(latest.folderIds || []), saved.id],
        });
      }
    }
    m.close();
    navigate(`/folder/${encodeURIComponent(saved.id)}`);
  }

  async function remove() {
    const ok = await confirmDanger({
      title: 'Delete folder',
      message: `Delete "${folder.title}"?`,
      detail: 'Videos and folders inside it stay in the library.',
      confirmLabel: 'Delete folder',
    });
    if (!ok) return;
    const parents = (state.libraryFolders || []).filter((item) => (item.folderIds || []).includes(folder.id));
    const result = await repo.deleteVideoFolder(folder.id);
    if (!result) return;
    m.close();
    toast('Folder deleted', {
      duration: config.undoMs,
      action: {
        label: 'Undo',
        fn: () => {
          repo.restoreVideoFolder(result.folder, result.parentIds).catch((e) => toast(e.message, { kind: 'error' }));
        },
      },
    });
    navigate(parents.length === 1 ? `/folder/${encodeURIComponent(parents[0].id)}` : '/');
  }
}
