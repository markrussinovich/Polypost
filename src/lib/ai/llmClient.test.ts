import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultLlmConfig } from './config';
import { generateText } from './llmClient';

vi.mock('./entraAuth', () => ({
  getFoundryAccessToken: vi.fn(),
}));

import { getFoundryAccessToken } from './entraAuth';

const mockGetFoundryAccessToken = vi.mocked(getFoundryAccessToken);

describe('llm client auth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetFoundryAccessToken.mockReset();
  });

  it('uses the API key for OpenAI-compatible requests by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateText({
      config: {
        ...defaultLlmConfig(),
        enabled: true,
        provider: 'openai',
        apiKey: 'sk-key',
        baseUrl: 'https://example.openai.azure.com/openai/v1',
        model: 'gpt-5.4-mini',
      },
      system: 'system',
      prompt: 'prompt',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ authorization: 'Bearer sk-key' });
  });

  it('uses a Microsoft Entra access token for Foundry-compatible requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    mockGetFoundryAccessToken.mockResolvedValue('entra-token');

    await generateText({
      config: {
        ...defaultLlmConfig(),
        enabled: true,
        provider: 'openai',
        authMode: 'entraId',
        tenantId: 'tenant-123',
        clientId: 'client-456',
        baseUrl: 'https://example.openai.azure.com/openai/v1',
        model: 'gpt-5.4-mini',
      },
      system: 'system',
      prompt: 'prompt',
    });

    expect(mockGetFoundryAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-123', clientId: 'client-456' }),
    );
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ authorization: 'Bearer entra-token' });
  });
});