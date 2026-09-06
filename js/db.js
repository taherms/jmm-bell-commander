/* ==========================================================================
   JMM Bell Commander — db.js
   Minimal IndexedDB wrapper, used only to store custom ring audio blobs.
   Timetables & settings live in localStorage (see app.js: Store.*)
   because they are small, plain JSON and need no async ceremony.
   ========================================================================== */

const RingsDB = (() => {
  const DB_NAME = 'jmm-bell-commander';
  const DB_VERSION = 1;
  const STORE = 'customRings';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open audio storage'));
    });
    return dbPromise;
  }

  async function put(record) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error || new Error('Could not save audio file'));
      tx.onabort = () => reject(tx.error || new Error('Audio storage transaction was aborted'));
    });
  }

  async function get(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Could not load audio file'));
    });
  }

  async function getAll() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || new Error('Could not list audio files'));
    });
  }

  async function remove(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not delete audio file'));
      tx.onabort = () => reject(tx.error || new Error('Audio storage transaction was aborted'));
    });
  }

  async function clear() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not clear audio storage'));
      tx.onabort = () => reject(tx.error || new Error('Audio storage transaction was aborted'));
    });
  }

  return { put, get, getAll, remove, clear };
})();
