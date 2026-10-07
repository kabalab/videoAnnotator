import { getHandle, setHandle, deleteHandle } from './handleStore.js';
import { LoadError } from './httpSource.js';

// Only ever imported (dynamically) when running locally. The public site never loads this module.

export function fsaSupport() {
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: 'This page isn\u2019t a secure context, so the browser disables direct file access. Open it from http://localhost or http://127.0.0.1 (Live Server does this).',
    };
  }
  if (typeof window.showDirectoryPicker !== 'function') {
    return {
      ok: false,
      reason: 'showDirectoryPicker is not available in this browser, so changes can\u2019t be written to the project files directly. Embedded browsers (such as the one inside Cursor or VS Code), Firefox and Safari don\u2019t support the File System Access API.',
    };
  }
  return { ok: true };
}

const splitPath = (path) => path.split('/').filter(Boolean);

export class FsaSource {
  constructor() {
    this.root = null;
    this.remembered = null;
    this.ext = null;
    this.extRemembered = null;
    this.queues = new Map();
  }

  get folderName() {
    return (this.root || this.remembered)?.name || '';
  }

  get externalName() {
    return (this.ext || this.extRemembered)?.name || '';
  }

  // ---- project folder ----

  async restore() {
    const handle = await getHandle('project');
    if (!handle) return 'none';
    this.remembered = handle;
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      this.root = handle;
      return 'granted';
    }
    return 'prompt';
  }

  // Must be called from a click: browsers only show permission prompts after a user gesture.
  async requestPermission() {
    const handle = this.root || this.remembered;
    if (!handle) throw new Error('No project folder has been connected yet.');
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new DOMException('Permission to edit the project folder was not granted.', 'NotAllowedError');
    await this.verify(handle);
    this.root = handle;
  }

  async pick() {
    const handle = await window.showDirectoryPicker({ id: 'video-annotator-project', mode: 'readwrite' });
    await this.verify(handle);
    this.root = handle;
    this.remembered = handle;
    await setHandle('project', handle);
  }

  async verify(handle) {
    try {
      const data = await handle.getDirectoryHandle('data');
      await data.getFileHandle('descriptors.json');
    } catch {
      throw new Error(`"${handle.name}" doesn't look like the project folder: data/descriptors.json isn't inside it. Choose the folder that contains index.html.`);
    }
  }

  async disconnect() {
    this.root = null;
    this.remembered = null;
    await deleteHandle('project');
  }

  async dir(parts, create = false, base = this.root) {
    if (!base) throw new DOMException('The project folder is not connected.', 'NotAllowedError');
    let d = base;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return d;
  }

  async fileHandle(path, create = false) {
    const parts = splitPath(path);
    const name = parts.pop();
    const dir = await this.dir(parts, create);
    return dir.getFileHandle(name, { create });
  }

  async readText(path) {
    let fh;
    try {
      fh = await this.fileHandle(path);
    } catch (e) {
      if (e.name === 'NotFoundError' || e.name === 'TypeMismatchError') {
        throw new LoadError(path, 'missing', `${path} was not found in the project folder.`);
      }
      throw e;
    }
    const file = await fh.getFile();
    return { text: await file.text(), lastModified: file.lastModified };
  }

  async lastModified(path) {
    try {
      return (await (await this.fileHandle(path)).getFile()).lastModified;
    } catch (e) {
      if (e.name === 'NotFoundError') return null;
      throw e;
    }
  }

  async exists(path) {
    try {
      await this.fileHandle(path);
      return true;
    } catch {
      return false;
    }
  }

  // Writes to the same file are queued so they never overlap.
  enqueue(path, task) {
    const prev = this.queues.get(path) || Promise.resolve();
    const next = prev.catch(() => {}).then(task);
    this.queues.set(path, next);
    return next;
  }

  writeText(path, text) {
    return this.enqueue(path, async () => {
      const fh = await this.fileHandle(path, true);
      const writable = await fh.createWritable();
      try {
        await writable.write(text);
        await writable.close();
      } catch (e) {
        await writable.abort().catch(() => {});
        throw e;
      }
      return (await fh.getFile()).lastModified;
    });
  }

  remove(path) {
    return this.enqueue(path, async () => {
      const parts = splitPath(path);
      const name = parts.pop();
      const dir = await this.dir(parts);
      try {
        await dir.removeEntry(name);
      } catch (e) {
        if (e.name !== 'NotFoundError') throw e;
      }
    });
  }

  async listFiles(dirPath, base = this.root) {
    try {
      const dir = await this.dir(splitPath(dirPath), false, base);
      const names = [];
      for await (const [name, handle] of dir.entries()) if (handle.kind === 'file') names.push(name);
      return names.sort((a, b) => a.localeCompare(b));
    } catch (e) {
      if (e.name === 'NotFoundError') return [];
      throw e;
    }
  }

  async uniqueName(dirPath, name) {
    const existing = new Set(await this.listFiles(dirPath));
    if (!existing.has(name)) return name;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let i = 2;
    while (existing.has(`${stem} (${i})${ext}`)) i++;
    return `${stem} (${i})${ext}`;
  }

  // Streams the file in chunks, so multi-GB videos never need to fit in memory.
  async copyInto(dirPath, file, { onProgress, signal } = {}) {
    const name = await this.uniqueName(dirPath, file.name);
    const dir = await this.dir(splitPath(dirPath), true);
    const fh = await dir.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    let written = 0;
    const total = file.size || 1;
    const counter = new TransformStream({
      transform(chunk, ctl) {
        written += chunk.byteLength;
        onProgress?.(written / total, written, total);
        ctl.enqueue(chunk);
      },
    });
    try {
      await file.stream().pipeThrough(counter).pipeTo(writable, { signal });
    } catch (e) {
      await dir.removeEntry(name).catch(() => {});
      throw e;
    }
    return name;
  }

  // ---- optional external videos folder (outside OneDrive, read-only) ----

  async restoreExternal() {
    const handle = await getHandle('externalVideos');
    if (!handle) return 'none';
    this.extRemembered = handle;
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm === 'granted') {
      this.ext = handle;
      return 'granted';
    }
    return 'prompt';
  }

  async pickExternal() {
    const handle = await window.showDirectoryPicker({ id: 'video-annotator-external', mode: 'read' });
    this.ext = handle;
    this.extRemembered = handle;
    await setHandle('externalVideos', handle);
  }

  async requestExternalPermission() {
    const handle = this.ext || this.extRemembered;
    if (!handle) throw new Error('No external videos folder has been connected.');
    const perm = await handle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') throw new DOMException('Permission to read the videos folder was not granted.', 'NotAllowedError');
    this.ext = handle;
  }

  async disconnectExternal() {
    this.ext = null;
    this.extRemembered = null;
    await deleteHandle('externalVideos');
  }

  async externalFile(name) {
    if (!this.ext) return null;
    try {
      return await (await this.ext.getFileHandle(name)).getFile();
    } catch {
      return null;
    }
  }

  async listExternal() {
    if (!this.ext) return [];
    return this.listFiles('', this.ext);
  }
}
