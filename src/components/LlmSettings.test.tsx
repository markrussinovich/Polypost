import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultLlmConfig } from '../lib/ai/config';
import { testConnection } from '../lib/ai/llmClient';
import { LlmSettings } from './LlmSettings';

vi.mock('../lib/ai/llmClient', () => ({
  testConnection: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LlmSettings', () => {
  it('enables AI after a successful connection test', async () => {
    vi.mocked(testConnection).mockResolvedValue({ ok: true, message: 'Connection OK' });
    const onSave = vi.fn();

    render(
      <LlmSettings
        config={{ ...defaultLlmConfig(), enabled: false, apiKey: 'sk-test' }}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    const enabled = screen.getByRole('checkbox', { name: /enable ai features/i });
    expect(enabled).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() => expect(enabled).toBeChecked());
    expect(screen.getByText('Connection OK')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });
});
