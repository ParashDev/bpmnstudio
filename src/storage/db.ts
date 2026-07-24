/**
 * Local persistence. All storage is optional: when IndexedDB is unavailable
 * (private browsing, strict modes) every function quietly no-ops and the
 * caller shows a one-time notice that autosave is off.
 */
import { openDB, type IDBPDatabase } from "idb";
import { idbAvailable } from "../env";

export interface AutosaveRecord {
  id: "current";
  xml: string;
  name: string;
  savedAt: number;
  /** random id of the tab session that wrote last (stale-tab detection) */
  sessionId: string;
}

export interface RecentRecord {
  id: string;
  name: string;
  xml: string;
  /** downscaled SVG markup for the thumbnail; may be empty */
  thumb: string;
  openedAt: number;
}

const DB_NAME = "bpmn-modeler";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase | null> | null = null;

export function getDb(): Promise<IDBPDatabase | null> {
  if (!dbPromise) {
    dbPromise = idbAvailable().then((ok) => {
      if (!ok) return null;
      return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          db.createObjectStore("autosave", { keyPath: "id" });
          db.createObjectStore("recents", { keyPath: "id" });
          db.createObjectStore("settings");
          db.createObjectStore("handles");
        },
      }).catch(() => null);
    });
  }
  return dbPromise;
}

export async function storageAvailable(): Promise<boolean> {
  return (await getDb()) !== null;
}

/* ---------------- settings ---------------- */

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  try {
    return await db.get("settings", key);
  } catch {
    return undefined;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.put("settings", value, key);
  } catch {
    /* non-fatal */
  }
}

/* ---------------- autosave ---------------- */

export async function readAutosave(): Promise<AutosaveRecord | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  try {
    return await db.get("autosave", "current");
  } catch {
    return undefined;
  }
}

export class QuotaError extends Error {}

export async function writeAutosave(rec: AutosaveRecord): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.put("autosave", rec);
  } catch (err) {
    if (isQuota(err)) throw new QuotaError();
    // Other write failures are non-fatal; work continues in memory.
  }
}

export async function clearAutosave(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.delete("autosave", "current");
  } catch {
    /* non-fatal */
  }
}

/* ---------------- recents ---------------- */

const MAX_RECENTS = 12;

export async function listRecents(): Promise<RecentRecord[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const all: RecentRecord[] = await db.getAll("recents");
    return all.sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

export async function putRecent(rec: RecentRecord): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.put("recents", rec);
    await pruneRecents(MAX_RECENTS);
  } catch (err) {
    if (isQuota(err)) {
      // Quota: drop oldest entries and retry once without the thumbnail.
      await pruneRecents(4);
      try {
        await db.put("recents", { ...rec, thumb: "" });
      } catch {
        /* give up quietly — recents are a convenience */
      }
      throw new QuotaError();
    }
  }
}

export async function removeRecent(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.delete("recents", id);
  } catch {
    /* non-fatal */
  }
}

async function pruneRecents(keep: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const all = await listRecents();
  for (const rec of all.slice(keep)) {
    await db.delete("recents", rec.id).catch(() => {});
  }
}

/* ---------------- file handles (FSA) ---------------- */

export async function storeHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.put("handles", handle, "last");
  } catch {
    /* handles are unstorable in some browsers — save falls back to download */
  }
}

export async function readHandle(): Promise<FileSystemFileHandle | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  try {
    return await db.get("handles", "last");
  } catch {
    return undefined;
  }
}

/* ---------------- clear everything ---------------- */

export async function clearAllLocalData(): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await Promise.all([
        db.clear("autosave"),
        db.clear("recents"),
        db.clear("settings"),
        db.clear("handles"),
      ]);
    } catch {
      /* best effort */
    }
  }
  try {
    localStorage.removeItem("bpmn-modeler:theme:v2");
    localStorage.removeItem("bpmn-modeler:clipboard");
  } catch {
    /* best effort */
  }
}

function isQuota(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}
