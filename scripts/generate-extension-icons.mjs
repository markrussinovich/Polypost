// Renders src/extension/public/favicon source SVG into the PNG icon sizes the
// Chrome Web Store / manifest require (16, 48, 128). Uses the CDP debug browser
// (canvas drawImage) so no native image tooling is needed.
//
// Usage: node scripts/generate-extension-icons.mjs
import fs from 'node:fs';
import path from 'node:path';

const SVG_PATH = 'public/favicon.svg';
const OUT_DIR = 'src/extension/public/icons';
const SIZES = [16, 48, 128];
const CDP = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9222';

const svg = fs.readFileSync(SVG_PATH, 'utf8');
const svgB64 = Buffer.from(svg).toString('base64');

const created = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
const socket = new WebSocket(created.webSocketDebuggerUrl);
let nextId = 0;

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const onMsg = (event) => {
      const data = JSON.parse(event.data);
      if (data.id !== id) return;
      socket.removeEventListener('message', onMsg);
      data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result);
    };
    socket.addEventListener('message', onMsg);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const expression = `(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,${svgB64}';
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = ${size};
    canvas.height = ${size};
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, ${size}, ${size});
    ctx.drawImage(img, 0, 0, ${size}, ${size});
    return canvas.toDataURL('image/png');
  })()`;

  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });

  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }

  const base64 = result.result.value.split(',')[1];
  const buffer = Buffer.from(base64, 'base64');
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(file, buffer);
  console.log(`wrote ${file} (${buffer.length} bytes)`);
}

socket.close();
await fetch(`${CDP}/json/close/${created.id}`);
process.exit(0);
