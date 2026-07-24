/**
 * Feature detection. Each capability degrades individually — a missing API
 * disables its feature with a user-visible explanation, never the whole app.
 */

export const env = {
  /** File System Access API: silent save-in-place. */
  fsa: typeof window !== "undefined" && "showOpenFilePicker" in window,
  /** CompressionStream: share links via URL fragment. */
  compression: typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined",
  /** Web Share API. */
  share: typeof navigator !== "undefined" && typeof navigator.share === "function",
  /** Secure context: FSA and share require HTTPS (or localhost). */
  secure: typeof window !== "undefined" && window.isSecureContext,
  /** ResizeObserver for panel resize handling. */
  resizeObserver: typeof ResizeObserver !== "undefined",
  /** Web Workers for off-main-thread validation. */
  worker: typeof Worker !== "undefined",
};

let idbChecked: Promise<boolean> | null = null;

/**
 * IndexedDB can exist but fail on open (Firefox strict mode, some private
 * windows), so availability is verified with a real open attempt.
 */
export function idbAvailable(): Promise<boolean> {
  if (idbChecked) return idbChecked;
  idbChecked = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(false);
      return;
    }
    try {
      const req = indexedDB.open("bpmn-modeler-probe");
      req.onerror = () => resolve(false);
      req.onsuccess = () => {
        req.result.close();
        try {
          indexedDB.deleteDatabase("bpmn-modeler-probe");
        } catch {
          /* ignore */
        }
        resolve(true);
      };
    } catch {
      resolve(false);
    }
  });
  return idbChecked;
}
