import { afterEach, describe, expect, it, vi } from 'vitest';

import { threadsSpec } from '../platforms/threads';
import { defaultLlmConfig, type LlmProvider } from './config';
import { generateFit } from './fit';
import { generateText, LlmError } from './llmClient';

const fragment = 'If AI writes the code, what does a junior engineer do';
const complete = `${fragment}? Learn to test assumptions, review the output, and build judgment. AI can write code, but engineers still need to understand why it works.`;

function reply(provider: LlmProvider, text: string, truncated: boolean) {
  switch (provider) {
    case 'anthropic':
      return { content: [{ type: 'text', text }], stop_reason: truncated ? 'max_tokens' : 'end_turn' };
    case 'openai':
      return { choices: [{ message: { content: text }, finish_reason: truncated ? 'length' : 'stop' }] };
    case 'gemini':
      return { candidates: [{ content: { parts: [{ text }] }, finishReason: truncated ? 'MAX_TOKENS' : 'STOP' }] };
  }
}

function response(data: object) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each<LlmProvider>(['anthropic', 'openai', 'gemini'])('%s generation completion', (provider) => {
  const config = { ...defaultLlmConfig(), provider, enabled: true, apiKey: 'test-key' };
  const tokenField = provider === 'anthropic' ? 'max_tokens' : 'max_completion_tokens';

  function budget(init: RequestInit | undefined): number {
    const body = JSON.parse(String(init?.body));
    return provider === 'gemini' ? body.generationConfig.maxOutputTokens : body[tokenField];
  }

  it('regenerates a truncated Threads post instead of accepting the short fragment as fitted', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(reply(provider, fragment, true)))
      .mockResolvedValueOnce(response(reply(provider, complete, false)));

    const result = await generateFit({ config, spec: threadsSpec, masterText: complete.repeat(5) });

    expect(result.text).toBe(complete);
    expect(result.withinLimit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => budget(init))).toEqual([2048, 4096]);
    const prompts = fetchMock.mock.calls.map(([, init]) => {
      const body = JSON.parse(String(init?.body));
      delete body.max_tokens;
      delete body.max_completion_tokens;
      delete body.generationConfig;
      return body;
    });
    expect(prompts[1]).toEqual(prompts[0]);
  });

  it('retries even when reasoning used the entire budget and left no visible text', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(reply(provider, '', true)))
      .mockResolvedValueOnce(response(reply(provider, complete, false)));

    await expect(generateText({ config, system: 's', prompt: 'p', maxTokens: 256 })).resolves.toBe(complete);
    expect(fetchMock.mock.calls.map(([, init]) => budget(init))).toEqual([256, 512]);
  });

  it('surfaces an error instead of returning a partial post after bounded retries', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementation(async () => response(reply(provider, fragment, true)));

    await expect(generateFit({ config, spec: threadsSpec, masterText: complete.repeat(5) }))
      .rejects.toThrow('token limit before finishing the post');
    expect(fetchMock.mock.calls.map(([, init]) => budget(init))).toEqual([2048, 4096, 8192]);
  });

  it('does not retry a completed response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(reply(provider, complete, false)));

    await expect(generateText({ config, system: 's', prompt: 'p' })).resolves.toBe(complete);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry unrelated API errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Model unavailable.' } }), { status: 400 }),
    );

    await expect(generateText({ config, system: 's', prompt: 'p' })).rejects.toThrow(LlmError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honors cancellation before retrying a truncated response', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      controller.abort();
      return response(reply(provider, fragment, true));
    });

    await expect(generateText({ config, system: 's', prompt: 'p', signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
