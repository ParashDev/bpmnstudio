/**
 * Robust text decoding for opened files: BOM sniffing (UTF-8, UTF-16 LE/BE),
 * an XML-declaration encoding hint, and CRLF normalization left intact —
 * bpmn-moddle handles CRLF fine, so content is not rewritten.
 */

export function decodeFileBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);

  // BOM detection
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }

  // Heuristic: UTF-16 without BOM (alternating zero bytes in the prolog)
  if (bytes.length >= 8) {
    const zerosEven = bytes[1] === 0 && bytes[3] === 0 && bytes[5] === 0;
    const zerosOdd = bytes[0] === 0 && bytes[2] === 0 && bytes[4] === 0;
    if (zerosEven) return new TextDecoder("utf-16le").decode(bytes);
    if (zerosOdd) return new TextDecoder("utf-16be").decode(bytes);
  }

  // Try UTF-8 strictly; on failure honor an encoding= hint, else latin1.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    const loose = new TextDecoder("utf-8").decode(bytes.subarray(0, 200));
    const m = /encoding=["']([\w-]+)["']/i.exec(loose);
    if (m) {
      try {
        return new TextDecoder(m[1].toLowerCase()).decode(bytes);
      } catch {
        /* unknown label — fall through */
      }
    }
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
