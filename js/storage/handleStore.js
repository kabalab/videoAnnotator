// Folder handles can't go in localStorage, but IndexedDB can store them so the app remembers
// which folder you connected. The browser still asks for permission again each session.
const DB_NAME = 'video-annotator';
const STORE = 'handles';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const getHandle = (key) => run('readonly', (s) => s.get(key));
export const setHandle = (key, handle) => run('readwrite', (s) => s.put(handle, key));
export const deleteHandle = (key) => run('readwrite', (s) => s.delete(key));
