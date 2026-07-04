// Echo mock of the OpenAI-compatible /v1/chat/completions endpoint. It returns
// the post content from the request verbatim, so an end-to-end test can verify
// that the app sends Markdown formatting to the model and parses it back without
// losing bold/italic/links. Usage: node scripts/mock-llm-echo.mjs
import { createServer } from 'node:http';

const PORT = process.env.MOCK_PORT ? Number(process.env.MOCK_PORT) : 8788;

// Pull the post body out of the fit/author prompt. buildFitRequest ends with
// "Post:\n<text>"; fall back to the whole user message otherwise.
function extractPost(userContent) {
  const marker = userContent.lastIndexOf('Post:\n');
  if (marker !== -1) {
    return userContent.slice(marker + 'Post:\n'.length).trim();
  }
  const draftMarker = userContent.lastIndexOf('Current draft:\n');
  if (draftMarker !== -1) {
    const after = userContent.slice(draftMarker + 'Current draft:\n'.length);
    const stop = after.indexOf('\n\nInstruction:');
    return (stop === -1 ? after : after.slice(0, stop)).trim();
  }
  return userContent.trim();
}

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
    let reply = 'OK';
    try {
      const parsed = JSON.parse(body);
      const userMessage = Array.isArray(parsed.messages)
        ? [...parsed.messages].reverse().find((m) => m.role === 'user')
        : null;
      if (userMessage?.content) {
        reply = extractPost(userMessage.content);
      }
    } catch {
      reply = 'OK';
    }

    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply } }] }));
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`echo LLM on http://127.0.0.1:${PORT}`));
