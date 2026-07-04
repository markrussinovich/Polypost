// Renders public/favicon.svg into the PNG icons the web app manifest needs for
// PWA installability (any-purpose 64/192/512, a full-bleed maskable 512, and an
// apple-touch icon). Uses @resvg/resvg-js (native, no browser/libvips required),
// which is the only rasterizer with a working win32-arm64 binary in this repo.
//
// Usage: node scripts/generate-pwa-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const SVG_PATH = 'public/favicon.svg';
const OUT_DIR = 'public';

const svg = fs.readFileSync(SVG_PATH, 'utf8');
// Maskable icons are masked to a platform-defined shape (often a circle), so the
// art must bleed to the edges with no rounded corners. Drop the rounded-rect
// radius; the plane glyph already sits inside the inner-80% safe zone.
const maskableSvg = svg.replace(/rx="\d+"/, 'rx="0"');

function render(source, size) {
  const resvg = new Resvg(source, { fitTo: { mode: 'width', value: size } });
  return resvg.render().asPng();
}

const targets = [
  { file: 'pwa-64x64.png', source: svg, size: 64 },
  { file: 'pwa-192x192.png', source: svg, size: 192 },
  { file: 'pwa-512x512.png', source: svg, size: 512 },
  { file: 'maskable-icon-512x512.png', source: maskableSvg, size: 512 },
  { file: 'apple-touch-icon-180x180.png', source: maskableSvg, size: 180 },
];

for (const { file, source, size } of targets) {
  const buffer = render(source, size);
  const out = path.join(OUT_DIR, file);
  fs.writeFileSync(out, buffer);
  console.log(`wrote ${out} (${buffer.length} bytes)`);
}
