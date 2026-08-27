import {
  filterTravelGenerationDrafts,
  isKnownTravelGenerationDraft,
  TRAVEL_HISTORY_CLEANUP_VERSION,
} from './travel-history-cleanup.mjs';

const DB_NAME = 'davis-seedance-studio-v2';
const DB_VERSION = 1;
const STORE = 'drafts';
const TRAVEL_HISTORY_CLEANUP_KEY = `seedance_travel_history_cleanup_${TRAVEL_HISTORY_CLEANUP_VERSION}`;
let travelCleanupAttempted = false;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run(mode, callback) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try { result = callback(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export async function listDrafts() {
  const db = await openDb();
  const drafts = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  let cleanupDone = false;
  try { cleanupDone = localStorage.getItem(TRAVEL_HISTORY_CLEANUP_KEY) === 'done'; } catch {}

  const cleanup = cleanupDone
    ? { kept: drafts.filter(draft => !isKnownTravelGenerationDraft(draft)), removed: drafts.filter(isKnownTravelGenerationDraft) }
    : filterTravelGenerationDrafts(drafts);

  if (!travelCleanupAttempted && cleanup.removed.length) {
    travelCleanupAttempted = true;
    await Promise.all(cleanup.removed.map(draft => deleteDraft(draft.id)));
  }
  if (!cleanupDone) {
    try { localStorage.setItem(TRAVEL_HISTORY_CLEANUP_KEY, 'done'); } catch {}
  }

  return cleanup.kept;
}

export function getDraft(id) {
  return run('readonly', store => store.get(id));
}

export function saveDraft(draft) {
  draft.updatedAt = Date.now();
  return run('readwrite', store => store.put(draft));
}

export function deleteDraft(id) {
  return run('readwrite', store => store.delete(id));
}
