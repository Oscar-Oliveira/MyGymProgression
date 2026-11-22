// Reads the v1 database of this browser, read-only, for the migration to v2 (V2-D2).
// v1 and v2 run on the same site, so v2 can read v1's IndexedDB directly. It never writes to it, never upgrades it,
// and never creates it when it does not exist.
import { emptyDataSet, TABLES, type DataSet } from '../domain/interchange';
import type { Settings } from '../domain/types';

/** Name of the v1 database (src/data/db.ts in v1). */
export const V1_DB_NAME = 'mygymprogression';

/** Opens an existing database at its current version; undefined when it does not exist (nothing is created). */
function openExisting(name: string): Promise<IDBDatabase | undefined> {
  return new Promise((resolve, reject) => {
    let missing = false;
    // No version: an existing database opens as it is, without an upgrade.
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => {
      // Only a new (empty) database asks for an upgrade without a version: cancel it, so it is not created.
      missing = true;
      req.transaction?.abort();
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => {
      if (!missing) return reject(req.error);
      e.preventDefault();
      resolve(undefined);
    };
    req.onblocked = () => reject(new Error('v1 database blocked'));
  });
}

const all = <T,>(store: IDBObjectStore) =>
  new Promise<T[]>((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result as T[]);
    r.onerror = () => reject(r.error);
  });

/** Everything in the v1 database of this browser, or undefined when there is none (or it has no data). */
export async function readV1(name = V1_DB_NAME): Promise<DataSet | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  const db = await openExisting(name);
  if (!db) return undefined;
  try {
    const stores = Array.from(db.objectStoreNames);
    if (!stores.includes('exercises')) return undefined;
    const tx = db.transaction(stores, 'readonly');
    const out = emptyDataSet();
    // Every request is made at once, inside the same read-only transaction.
    const tables = TABLES.filter((t) => stores.includes(t));
    const [rows, settings] = await Promise.all([
      Promise.all(tables.map((t) => all(tx.objectStore(t)))),
      stores.includes('settings') ? all<Settings>(tx.objectStore('settings')) : Promise.resolve([]),
    ]);
    tables.forEach((t, i) => ((out[t] as unknown[]) = rows[i]));
    out.settings = settings.find((s) => s.id === 'settings');
    const empty = TABLES.every((t) => out[t].length === 0);
    return empty ? undefined : out;
  } finally {
    db.close();
  }
}
