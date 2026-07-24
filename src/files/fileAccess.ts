/**
 * File open/save built on the File System Access API where available, with an
 * <input type="file"> / download fallback everywhere else.
 */
import { env } from "../env";
import { decodeFileBuffer } from "./decode";

export interface OpenedFile {
  name: string;
  text: string;
  handle: FileSystemFileHandle | null;
}

const PICKER_TYPES = [
  {
    description: "BPMN 2.0 diagram",
    accept: { "application/xml": [".bpmn", ".xml"] as `.${string}`[] },
  },
];

export async function openFilePicker(): Promise<OpenedFile | null> {
  if (env.fsa) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: PICKER_TYPES,
        multiple: false,
      });
      const file: File = await handle.getFile();
      return { name: file.name, text: decodeFileBuffer(await file.arrayBuffer()), handle };
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return null;
      // FSA failed unexpectedly — fall through to the input fallback.
    }
  }
  return openViaInput();
}

function openViaInput(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".bpmn,.xml,application/xml,text/xml";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve({ name: file.name, text: decodeFileBuffer(await file.arrayBuffer()), handle: null });
    };
    // Cancel produces no event in some browsers; resolve on focus return.
    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      setTimeout(() => resolve(null), 400);
    };
    window.addEventListener("focus", onFocus, { once: true });
    input.click();
  });
}

export async function readDroppedFile(file: File): Promise<OpenedFile> {
  return { name: file.name, text: decodeFileBuffer(await file.arrayBuffer()), handle: null };
}

export type SaveOutcome =
  | { kind: "saved-in-place"; name: string }
  | { kind: "downloaded"; name: string }
  | { kind: "cancelled" };

/**
 * Save to the known handle if permission holds (re-requesting if it was
 * revoked between sessions), else fall back to Save As / download.
 */
export async function saveToHandle(
  handle: FileSystemFileHandle,
  xml: string,
): Promise<SaveOutcome | null> {
  try {
    const perm = await (handle as any).queryPermission?.({ mode: "readwrite" });
    if (perm !== "granted") {
      const req = await (handle as any).requestPermission?.({ mode: "readwrite" });
      if (req !== "granted") return null;
    }
    const writable = await handle.createWritable();
    await writable.write(xml);
    await writable.close();
    return { kind: "saved-in-place", name: handle.name };
  } catch {
    return null;
  }
}

export async function saveAs(
  xml: string,
  suggestedName: string,
): Promise<{ outcome: SaveOutcome; handle: FileSystemFileHandle | null }> {
  const name = suggestedName.endsWith(".bpmn") ? suggestedName : `${suggestedName}.bpmn`;
  if (env.fsa) {
    try {
      const handle: FileSystemFileHandle = await (window as any).showSaveFilePicker({
        suggestedName: name,
        types: PICKER_TYPES,
      });
      const writable = await handle.createWritable();
      await writable.write(xml);
      await writable.close();
      return { outcome: { kind: "saved-in-place", name: handle.name }, handle };
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        return { outcome: { kind: "cancelled" }, handle: null };
      }
      // fall through to download
    }
  }
  downloadText(xml, name, "application/xml");
  return { outcome: { kind: "downloaded", name }, handle: null };
}

export function downloadText(text: string, filename: string, mime: string) {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
