// Drives the autofit/length-revision loop end to end against the mock LLM.
// Configures the app to use the mock endpoint, types an over-limit post, waits
// for the idle autofit pass, and reports each enabled card's count + AI badge.
const endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9222/json/list';
const APP_PORT = process.env.APP_PORT ?? '5177';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:8787';
const WITH_LINK = process.env.WITH_LINK === '1';

const targets = await (await fetch(endpoint)).json();
const target = targets.find((c) => c.type === 'page' && c.url.includes(`127.0.0.1:${APP_PORT}`));
if (!target) {
  console.error('No app page found for port', APP_PORT);
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
await call('Runtime.enable');
await call('Page.enable');

// 1. Configure the mock LLM + autofit, and optionally pre-seed a shared link.
await evaluate(`(() => {
  localStorage.setItem('omnipost:llm-config-v1', JSON.stringify({
    enabled: true, provider: 'anthropic', baseUrl: ${JSON.stringify(MOCK)},
    apiKey: 'test', model: 'mock', autoFit: true, stylePrompt: ''
  }));
  ${WITH_LINK
    ? `localStorage.setItem('omnipost:media-v1', JSON.stringify([{ id: 'l1', kind: 'link', name: 'ref', url: 'https://example.com/a/fairly/long/reference/url' }]));`
    : `localStorage.removeItem('omnipost:media-v1');`}
  return true;
})()`);

await call('Page.reload');
// Wait for the editor to remount.
for (let i = 0; i < 40; i += 1) {
  const ready = await evaluate(`Boolean(document.querySelector('.rich-editor-content'))`);
  if (ready) break;
  await sleep(150);
}

// 2. Type an over-limit post (well past X's 280).
await evaluate(`(async () => {
  const ed = document.querySelector('.rich-editor-content');
  ed.focus();
  document.execCommand('selectAll', false, null);
  const medium = 'We are thrilled to announce the launch of our brand new platform today after many months of hard work from the entire team here, and we genuinely cannot wait for every single one of you to try it out, kick the tires, and share your honest, candid feedback with all of us soon.';
  const long = 'We are thrilled to announce the launch of our brand new platform that has been months in the making and represents a huge leap forward for everyone on the team and our customers, with many more exciting features coming very soon, so please stay tuned and share this widely. '.repeat(2);
  document.execCommand('insertText', false, ${process.env.MEDIUM === '1' ? 'medium' : 'long'});
  return ed.textContent.length;
})()`);

// 3. Wait out the 3s idle autofit + the mock round-trip.
await sleep(6000);

// 4. Report each enabled card.
const report = await evaluate(`(() => {
  return [...document.querySelectorAll('.platform-card')].map((card) => {
    const meter = card.querySelector('.character-meter');
    return {
      platform: card.getAttribute('aria-label'),
      count: meter ? meter.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40) : null,
      aiBadge: Boolean(card.querySelector('.platform-card-badge.is-ai')),
      adapting: Boolean(card.querySelector('.platform-card-badge.is-generating')),
      status: card.className.match(/is-(ok|warn|over|error)/)?.[0] ?? null,
    };
  });
})()`);
const railError = await evaluate(`document.querySelector('.rail-ai-error')?.textContent ?? null`);

console.log(JSON.stringify({ withLink: WITH_LINK, railError, report }, null, 2));
socket.close();
