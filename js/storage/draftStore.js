// Backup for edits that couldn't be written to the project files. The JSON files stay the source
// of truth; a draft is cleared once the file on disk (or served over HTTP) matches it.
const KEY = 'va.drafts.v1';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch (e) {
    throw new Error(`Couldn't keep a draft in browser storage (${e.name}). Download the changed file now so the edit isn't lost.`);
  }
}

export const draftStore = {
  list() {
    return Object.entries(readAll())
      .map(([path, d]) => ({ path, ...d }))
      .sort((a, b) => a.path.localeCompare(b.path));
  },
  get(path) {
    return readAll()[path] || null;
  },
  put(path, text) {
    const all = readAll();
    all[path] = { text, savedAt: new Date().toISOString() };
    writeAll(all);
  },
  putDeleted(path) {
    const all = readAll();
    all[path] = { deleted: true, savedAt: new Date().toISOString() };
    writeAll(all);
  },
  remove(path) {
    const all = readAll();
    if (!(path in all)) return;
    delete all[path];
    writeAll(all);
  },
  clear() {
    writeAll({});
  },
  count() {
    return Object.keys(readAll()).length;
  },
};
