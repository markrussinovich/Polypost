// Diagnose the web app's shared-media feature: type into the master editor, push
// an image through the MediaTray file input (the real onChange path), and report
// whether the per-card attachment strip renders.
const endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9222/json/list';
const APP_PORT = process.env.APP_PORT ?? '5177';
const IMAGE_PATH = process.env.IMAGE_PATH ?? 'C:\\source\\LinkedInFormat\\public\\favicon.svg';

const targets = await (await fetch(endpoint)).json();
const target = targets.find((c) => c.type === 'page' && c.url.includes(`127.0.0.1:${APP_PORT}`));

if (!target) {
  console.error('No app page found for port', APP_PORT, '\nOpen targets:', targets.filter((t) => t.type === 'page').map((t) => t.url));
  process.exit(1);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    function onMessage(event) {
      const data = JSON.parse(event.data);
      if (data.id !== id) return;
      socket.removeEventListener('message', onMessage);
      data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result);
    }
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}
const evaluate = (expression) =>
  call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then((r) => r.result.value);

await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
await call('Runtime.enable');
await call('DOM.enable');
await call('Page.enable');

// 1. Type text into the master editor so cards have content.
await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ed = document.querySelector('.rich-editor-content');
  ed.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, 'Shipping our new feature today. Excited to share what we built.');
  await sleep(150);
  return true;
})()`);

// 2. Open the media tray and locate the image file input.
await evaluate(`(() => {
  const tray = document.querySelector('details.media-tray');
  if (tray) tray.open = true;
  return Boolean(tray);
})()`);

// 3. Push an image through the input via DOM.setFileInputFiles (real onChange).
const { root } = await call('DOM.getDocument', { depth: -1 });
const { nodeId } = await call('DOM.querySelector', {
  nodeId: root.nodeId,
  selector: 'details.media-tray input[type="file"][accept="image/*"]',
});

if (!nodeId) {
  console.log(JSON.stringify({ step: 'find-input', found: false }, null, 2));
  socket.close();
  process.exit(0);
}

await call('DOM.setFileInputFiles', { files: [IMAGE_PATH], nodeId });
await evaluate('new Promise((r) => setTimeout(r, 300))');

// 4. Inspect the result: tray list + per-card strips.
const report = await evaluate(`(() => {
  const trayItems = document.querySelectorAll('.media-list .media-item').length;
  const cards = [...document.querySelectorAll('.platform-card')].map((card) => ({
    platform: card.getAttribute('aria-label'),
    strip: Boolean(card.querySelector('.card-attachments')),
    mediaThumbs: card.querySelectorAll('.card-attachment.is-media').length,
    imgSrcOk: [...card.querySelectorAll('.card-attachment-thumb')].every((n) => (n.getAttribute('src') || '').startsWith('blob:')),
  }));
  return { trayItems, cards };
})()`);

console.log(JSON.stringify(report, null, 2));
socket.close();
