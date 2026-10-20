const DB_NAME = 'tunicious-library';
const DB_VERSION = 1;
const STORE = 'snapshots';

let dbPromise = null;

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'uid' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Failed to open the library snapshot database'));
      };
    });
  }
  return dbPromise;
}

function runTransaction(mode, run) {
  return openDatabase().then((db) => {
    if (!db) return undefined;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      let result;
      const request = run(transaction.objectStore(STORE));
      if (request) {
        request.onsuccess = () => {
          result = request.result;
        };
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('Library snapshot transaction failed'));
      transaction.onabort = () => reject(transaction.error || new Error('Library snapshot transaction aborted'));
    });
  });
}

export async function readLibrarySnapshot(uid) {
  if (!uid) return null;
  const snapshot = await runTransaction('readonly', (store) => store.get(uid));
  return snapshot || null;
}

export async function writeLibrarySnapshot(uid, snapshot) {
  if (!uid) return;
  await runTransaction('readwrite', (store) => store.put({
    uid,
    total: typeof snapshot?.total === 'number' ? snapshot.total : 0,
    newestAddedAt: snapshot?.newestAddedAt || null,
    albums: snapshot?.albums || [],
    updatedAt: Date.now()
  }));
}

export async function clearLibrarySnapshots() {
  await runTransaction('readwrite', (store) => store.clear());
}
