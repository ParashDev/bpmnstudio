/**
 * Serverless sharing: deflate-raw compress the XML, base64url it, and place
 * it in the URL fragment. Fragments never reach a server. Length is guarded —
 * beyond ~30k characters, browsers and chat clients start truncating URLs.
 */
import { env } from "../env";

export const MAX_SHARE_URL_LENGTH = 30000;

export class ShareUnavailableError extends Error {
  constructor() {
    super("This browser does not support the compression API needed for share links.");
  }
}

export class ShareTooLongError extends Error {
  constructor(public length: number) {
    super(
      `This diagram compresses to a ${length.toLocaleString()}-character link, which browsers and chat apps will truncate. Send the .bpmn file instead.`,
    );
  }
}

async function pipe(data: Uint8Array, stream: any): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encodeShareUrl(xml: string): Promise<string> {
  if (!env.compression) throw new ShareUnavailableError();
  const compressed = await pipe(
    new TextEncoder().encode(xml),
    new CompressionStream("deflate-raw"),
  );
  const url = `${location.origin}/#d=${toBase64Url(compressed)}`;
  if (url.length > MAX_SHARE_URL_LENGTH) throw new ShareTooLongError(url.length);
  return url;
}

export function readShareFragment(): string | null {
  const hash = location.hash;
  if (!hash.startsWith("#d=")) return null;
  return hash.slice(3);
}

export async function decodeShareFragment(fragment: string): Promise<string> {
  if (!env.compression) throw new ShareUnavailableError();
  const bytes = fromBase64Url(fragment);
  const xmlBytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
  const xml = new TextDecoder().decode(xmlBytes);
  if (!xml.includes("<")) throw new Error("The link did not decode to XML.");
  return xml;
}
