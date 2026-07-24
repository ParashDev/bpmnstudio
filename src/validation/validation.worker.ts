/// <reference lib="webworker" />
import { validateXml } from "./engine";

self.onmessage = async (event: MessageEvent<{ seq: number; xml: string }>) => {
  const { seq, xml } = event.data;
  const result = await validateXml(xml);
  (self as unknown as Worker).postMessage({ seq, result });
};
