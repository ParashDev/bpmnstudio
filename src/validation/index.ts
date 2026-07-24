/**
 * Public validation API: debounced, off the main thread when Workers exist,
 * with stale-result suppression (only the latest request's answer is used).
 */
import { env } from "../env";
import type { ValidationResult } from "./types";

export type { Finding, Severity, ValidationResult } from "./types";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: ValidationResult) => void>();

function getWorker(): Worker | null {
  if (!env.worker) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./validation.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<{ seq: number; result: ValidationResult }>) => {
        pending.get(event.data.seq)?.(event.data.result);
        pending.delete(event.data.seq);
      };
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
      };
    } catch {
      worker = null;
    }
  }
  return worker;
}

export async function validate(xml: string): Promise<ValidationResult> {
  const w = getWorker();
  if (w) {
    const mySeq = ++seq;
    return new Promise<ValidationResult>((resolve) => {
      pending.set(mySeq, resolve);
      w.postMessage({ seq: mySeq, xml });
    });
  }
  const { validateXml } = await import("./engine");
  return validateXml(xml);
}
