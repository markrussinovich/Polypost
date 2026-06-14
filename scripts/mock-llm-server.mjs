// Tiny mock of the Anthropic /v1/messages endpoint for testing the fit loop
// without a real API key. Returns a fixed short reply with permissive CORS so the
// browser app can call it directly. Usage: node scripts/mock-llm-server.mjs
import { createServer } from 'node:http';

const PORT = process.env.MOCK_PORT ? Number(process.env.MOCK_PORT) : 8787;
// A deliberately short reply so the fit loop succeeds on the first attempt.
const REPLY = process.env.MOCK_REPLY ?? 'Shipped it. Short, punchy, and well under the limit. 🚀';

const server = createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': '*',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: REPLY }] }));
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`mock LLM on http://127.0.0.1:${PORT}`));
