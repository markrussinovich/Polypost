import type { LlmConfig } from './config';

export interface GenerateOptions {
  config: LlmConfig;
  system: string;
  prompt: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export class LlmError extends Error {}

const DEFAULT_MAX_TOKENS = 2048;
const ANTHROPIC_VERSION = '2023-06-01';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

// Single entry point for all supported API shapes. Returns the model's plain-text reply.
export async function generateText({ config, system, prompt, maxTokens = DEFAULT_MAX_TOKENS, signal }: GenerateOptions): Promise<string> {
  if (config.provider === 'anthropic') {
    return generateAnthropic({ config, system, prompt, maxTokens, signal });
  }

  if (config.provider === 'gemini') {
    return generateGemini({ config, system, prompt, maxTokens, signal });
  }

  return generateOpenAI({ config, system, prompt, maxTokens, signal });
}

export interface TestResult {
  ok: boolean;
  message: string;
}

// A minimal round-trip used by the settings "Test connection" button.
export async function testConnection(config: LlmConfig, signal?: AbortSignal): Promise<TestResult> {
  try {
    const reply = await generateText({
      config,
      system: 'You are a connection test. Reply with exactly: OK',
      prompt: 'ping',
      maxTokens: 16,
      signal,
    });
    return { ok: true, message: `Connected. Model replied: "${reply.slice(0, 40)}"` };
  } catch (error) {
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

async function generateAnthropic({ config, system, prompt, maxTokens, signal }: Required<Omit<GenerateOptions, 'signal'>> & { signal?: AbortSignal }): Promise<string> {
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

  const text = Array.isArray(data?.content)
    ? data.content.filter((block: { type?: string }) => block?.type === 'text').map((block: { text?: string }) => block.text ?? '').join('')
    : '';

  if (!text.trim()) {
    throw new LlmError('The model returned an empty response.');
  }

  return text.trim();
}

async function generateOpenAI({ config, system, prompt, maxTokens, signal }: Required<Omit<GenerateOptions, 'signal'>> & { signal?: AbortSignal }): Promise<string> {
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

  const text: string = data?.choices?.[0]?.message?.content ?? '';

  if (!text.trim()) {
    throw new LlmError('The model returned an empty response.');
  }

  return text.trim();
}

async function generateGemini({ config, system, prompt, maxTokens, signal }: Required<Omit<GenerateOptions, 'signal'>> & { signal?: AbortSignal }): Promise<string> {
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

  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((part: { text?: string }) => part.text ?? '').join('') : '';

  if (!text.trim()) {
    throw new LlmError('The model returned an empty response.');
  }

  return text.trim();
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
