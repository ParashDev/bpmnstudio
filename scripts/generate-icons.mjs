/**
 * Generates all raster brand assets from the vector logo:
 *   icon-192.png, icon-512.png (maskable), apple-touch-icon.png (180),
 *   favicon.ico (32+16), og.png (1200x630).
 * Run: node scripts/generate-icons.mjs
 */
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const TEAL = "#0d9488";
const OUT = resolve(process.cwd(), "public");

// Glyph on a full-bleed rounded square. For maskable use the safe zone is the
// central 80%, so the glyph is drawn well inside it.
function appIconSvg(size, radiusRatio = 0.22) {
  const r = Math.round(size * radiusRatio);
  const s = size / 32; // glyph designed on a 32-unit grid
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${TEAL}"/>
  <g stroke="#ffffff" stroke-width="${1.8 * s}" fill="none">
    <circle cx="${9 * s}" cy="${16 * s}" r="${3.4 * s}"/>
    <path d="M ${12.4 * s} ${16 * s} L ${16.4 * s} ${16 * s}"/>
    <path d="M ${21.5 * s} ${10.8 * s} L ${26 * s} ${16 * s} L ${21.5 * s} ${21.2 * s} L ${17 * s} ${16 * s} Z" stroke-linejoin="round"/>
  </g>
</svg>`;
}

function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="0" y="0" width="1200" height="8" fill="${TEAL}"/>
  <g transform="translate(96, 208)">
    <rect width="96" height="96" rx="21" fill="${TEAL}"/>
    <g stroke="#ffffff" stroke-width="5.4" fill="none">
      <circle cx="27" cy="48" r="10.2"/>
      <path d="M 37.2 48 L 49.2 48"/>
      <path d="M 64.5 32.4 L 78 48 L 64.5 63.6 L 51 48 Z" stroke-linejoin="round"/>
    </g>
  </g>
  <text x="222" y="272" font-family="Segoe UI, Arial, sans-serif" font-size="64" font-weight="600" fill="#18181b" letter-spacing="-1">BPMN Studio</text>
  <text x="224" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#52525b">Free BPMN 2.0 editor in your browser</text>
  <text x="224" y="378" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#52525b">No signup. Files never leave your device.</text>
  <g font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="#8e8e96">
    <text x="96" y="540">bpmnstudio.dplooy.com</text>
  </g>
</svg>`;
}

async function render(svg, size, path) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(resolve(OUT, path));
  console.log("wrote", path);
}

await render(appIconSvg(512), 512, "icon-512.png");
await render(appIconSvg(512), 192, "icon-192.png");
await render(appIconSvg(512, 0.19), 180, "apple-touch-icon.png");

const png32 = await sharp(Buffer.from(appIconSvg(512))).resize(32, 32).png().toBuffer();
const png16 = await sharp(Buffer.from(appIconSvg(512))).resize(16, 16).png().toBuffer();
await writeFile(resolve(OUT, "favicon.ico"), await pngToIco([png32, png16]));
console.log("wrote favicon.ico");

await sharp(Buffer.from(ogSvg())).png().toFile(resolve(OUT, "og.png"));
console.log("wrote og.png");
