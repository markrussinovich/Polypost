import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { defaultLlmConfig } from '../lib/ai/config';
import { LlmSettings } from './LlmSettings';

vi.mock('../lib/ai/llmClient', () => ({
  testConnection: vi.fn().mockResolvedValue({ ok: true, message: 'Connected.' }),
}));

describe('LlmSettings', () => {
  it('switches the OpenAI-compatible auth fields to Microsoft Entra ID mode', () => {
    render(<LlmSettings config={{ ...defaultLlmConfig(), provider: 'openai' }} onSave={() => {}} onClose={() => {}} />);

    expect(screen.getByRole('combobox', { name: /Authentication/i })).toHaveValue('apiKey');
    expect(screen.getByLabelText(/API key/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: /Authentication/i }), { target: { value: 'entraId' } });

    expect(screen.getByLabelText(/Tenant ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Client ID/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/i)).toBeNull();
  });
});