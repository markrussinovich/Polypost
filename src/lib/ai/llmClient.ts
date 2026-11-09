import type { LlmConfig } from './config';

export interface GenerateOptions {
  config: LlmConfig;
  system: string;
  prompt: string;
  maxTokens?: number;
  requireComplete?: boolean;
  signal?: AbortSignal;
}

export class LlmError extends Error {}

class TokenLimitError extends LlmError {
  constructor() {
    super('The model reached its token limit before finishing the post. Try again or choose a model with a larger output budget.');
  }
}

const DEFAULT_MAX_TOKENS = 2048;
const MAX_GENERATION_ATTEMPTS = 3;
const ANTHROPIC_VERSION = '2023-06-01';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

// Single entry point for all supported API shapes. Returns the model's plain-text reply.
export async function generateText({ config, system, prompt, maxTokens = DEFAULT_MAX_TOKENS, requireComplete = false, signal }: GenerateOptions): Promise<string> {
  try {
    for (let attempt = 0; ; attempt += 1) {
      signal?.throwIfAborted();
      const options = { config, system, prompt, maxTokens: maxTokens * 2 ** attempt, requireComplete, signal };

      try {
        if (config.provider === 'anthropic') {
          return await generateAnthropic(options);
        }

        if (config.provider === 'gemini') {
          return await generateGemini(options);
        }

        return await generateOpenAI(options);
      } catch (error) {
        // Reasoning can consume most of the output budget, leaving even a
        // short post unfinished. Regenerate rather than publish that fragment.
        if (!(error instanceof TokenLimitError) || attempt + 1 >= MAX_GENERATION_ATTEMPTS) {
          throw error;
        }
      }
    }
  } catch (error) {
    // Server error bodies can echo the request's credentials (some gateways
    // include the offending key in "incorrect API key" messages); every message
    // that can reach the UI must be scrubbed, not just the test-connection path.
    if (error instanceof LlmError) {
      throw new LlmError(redactApiKey(error.message, config.apiKey));
    }

    throw error;
  }
}

export interface TestResult {
  ok: boolean;
  message: string;
}

// A minimal round-trip used by the settings "Test connection" button.
// The token cap has to leave room for hidden reasoning: reasoning-class models
// spend the whole budget thinking at a tiny cap and return empty content,
// which would fail the test even though the key and endpoint are fine.
const TEST_MAX_TOKENS = 256;
const TEST_TIMEOUT_MS = 15_000;

export async function testConnection(config: LlmConfig, signal?: AbortSignal): Promise<TestResult> {
  try {
    const reply = await generateText({
      config,
      system: 'You are a connection test. Reply with exactly: OK',
      prompt: 'ping',
      maxTokens: TEST_MAX_TOKENS,
      signal: signal ?? AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
    return { ok: true, message: `Connected. Model replied: "${reply.slice(0, 40)}"` };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { ok: false, message: `The endpoint did not respond within ${TEST_TIMEOUT_MS / 1000} seconds.` };
    }

    const message = error instanceof Error ? error.message : 'Connection failed.';
    return { ok: false, message: redactApiKey(message, config.apiKey) };
  }
}

// Defensively strip the API key from any error text before surfacing it, since
// provider or network errors can echo back the request URL or headers.
function redactApiKey(message: string, apiKey: string): string {
  if (!apiKey) return message;
  return message.split(apiKey).join('[redacted]');
}

async function generateAnthropic({ config, system, prompt, maxTokens, requireComplete, signal }: Required<Omit<GenerateOptions, 'signal'>> & { signal?: AbortSignal }): Promise<string> {
  const endpoint = `${trimTrailingSlash(config.baseUrl)}/v1/messages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      // Required for the API to accept calls made directly from a browser.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new LlmError(extractErrorMessage(data) ?? `Request failed (${response.status}).`);
  }

  if (requireComplete && data?.stop_reason === 'max_tokens') throw incompleteResponse();
  if (data?.stop_reason === 'max_tokens') {
    throw new TokenLimitError();
  }

  const text = Array.isArray(data?.content)
    ? data.content.filter((block: { type?: string }) => block?.type === 'text').map((block: { text?: string }) => block.text ?? '').join('')
    : '';

  if (!text.trim()) {
    throw new LlmError('The model returned an empty response.');
  }

  return text.trim();
}

async function generateOpenAI({ config, system, prompt, maxTokens, requireComplete, signal }: Required<Omit<GenerateOptions, 'signal'>> & { signal?: AbortSignal }): Promise<string> {
  const endpoint = `${trimTrailingSlash(config.baseUrl)}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      // Newer OpenAI models reject the legacy `max_tokens` and require
      // `max_completion_tokens` instead.
      max_completion_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new LlmError(extractErrorMessage(data) ?? `Request failed (${response.status}).`);
  }

  if (requireComplete && data?.choices?.[0]?.finish_reason === 'length') throw incompleteResponse();
  if (data?.choices?.[0]?.finish_reason === 'length') {
    throw new TokenLimitError();
  }

  const text: string = data?.choices?.[0]?.message?.content ?? '';

  if (!text.trim()) {
    throw new LlmError('The model returned an empty response.');
  }

  return text.trim();
}

async function generateGemini({ config, system, prompt, maxTokens, requireComplete, signal }: Required<Omit<GenerateOptions, 'signal'>> & { signal?: AbortSignal }): Promise<string> {
  const endpoint = `${trimTrailingSlash(config.baseUrl)}/models/${encodeURIComponent(config.model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new LlmError(extractErrorMessage(data) ?? `Request failed (${response.status}).`);
  }

  if (requireComplete && data?.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw incompleteResponse();
  if (data?.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new TokenLimitError();
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((part: { text?: string }) => part.text ?? '').join('') : '';

  if (!text.trim()) {
    throw new LlmError('The model returned an empty response.');
  }

  return text.trim();
}

function incompleteResponse(): LlmError {
  return new LlmError('The model hit its output limit before completing the response. Nothing was applied; try a model with a larger output capacity.');
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractErrorMessage(data: any): string | null {
  return data?.error?.message ?? (typeof data?.error === 'string' ? data.error : null);
}
