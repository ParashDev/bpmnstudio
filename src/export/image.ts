/**
 * SVG and PNG export. Both honor an explicit background choice and padding —
 * never the current canvas theme. PNG rasterizes the SVG through an
 * offscreen canvas; text uses system font families declared inside the SVG,
 * so no font embedding is needed for it to render.
 */

export interface ImageOptions {
  /** "transparent" or a CSS color */
  background: string;
  padding: number;
  /** PNG only */
  scale: 1 | 2 | 3;
}

interface ParsedSvg {
  node: SVGSVGElement;
  width: number;
  height: number;
}

function parseSvg(svg: string): ParsedSvg {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const node = doc.documentElement as unknown as SVGSVGElement;
  const width = parseFloat(node.getAttribute("width") ?? "0") || 300;
  const height = parseFloat(node.getAttribute("height") ?? "0") || 150;
  return { node, width, height };
}

/** Returns a standalone SVG string with padding and optional background. */
export function decorateSvg(svg: string, opts: Omit<ImageOptions, "scale">): string {
  const { node, width, height } = parseSvg(svg);
  const pad = Math.max(0, opts.padding);

  const vb = node.getAttribute("viewBox")?.split(/[\s,]+/).map(Number) ?? [0, 0, width, height];
  const [vx, vy, vw, vh] = vb;

  node.setAttribute("viewBox", `${vx - pad} ${vy - pad} ${vw + pad * 2} ${vh + pad * 2}`);
  node.setAttribute("width", String(width + pad * 2));
  node.setAttribute("height", String(height + pad * 2));

  if (opts.background !== "transparent") {
    const rect = node.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(vx - pad));
    rect.setAttribute("y", String(vy - pad));
    rect.setAttribute("width", String(vw + pad * 2));
    rect.setAttribute("height", String(vh + pad * 2));
    rect.setAttribute("fill", opts.background);
    node.insertBefore(rect, node.firstChild);
  }

  return new XMLSerializer().serializeToString(node);
}

export async function svgToPngBlob(svg: string, opts: ImageOptions): Promise<Blob> {
  const decorated = decorateSvg(svg, opts);
  const { width, height } = parseSvg(decorated);

  const img = new Image();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(decorated)}`;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("The diagram image could not be rendered."));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * opts.scale));
  canvas.height = Math.max(1, Math.round(height * opts.scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");

  if (opts.background !== "transparent") {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG encoding failed."));
    }, "image/png");
  });
}
