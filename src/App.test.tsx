import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorNode } from './lib/exportText';

vi.mock('./components/EditorShell', () => ({
  EditorShell: ({ onDocumentChange }: { onDocumentChange: (document: EditorNode) => void }) => (
    <textarea
      aria-label="Mock post editor"
      onChange={(event) => {
        onDocumentChange({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: event.target.value }] }],
        });
      }}
    />
  ),
}));

vi.mock('./lib/ai/fit', () => ({
  generateFit: vi.fn(async () => ({
    doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Adapted' }] }] },
    text: 'Adapted',
    count: 7,
    withinLimit: true,
    attempts: 1,
  })),
}));

import { generateFit } from './lib/ai/fit';
import App from './App';

function saveAiSettings(stylePrompt = '') {
  fireEvent.click(screen.getByLabelText('AI settings'));
  fireEvent.click(screen.getByRole('checkbox', { name: /enable ai features/i }));
  fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: 'sk-test' } });

  if (stylePrompt) {
    fireEvent.change(screen.getByLabelText(/style guidance/i), { target: { value: stylePrompt } });
  }

  fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
}

describe('App URL preview fetching', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { title: 'Preview title' } }),
    } as unknown as Response);
    vi.mocked(generateFit).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits for three seconds of inactivity before fetching URL preview metadata', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Launch https://example.test/post' } });

    await act(async () => {
      vi.advanceTimersByTime(2999);
    });

    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://api.microlink.io/?screenshot=true&url=https%3A%2F%2Fexample.test%2Fpost', { signal: undefined });
  });

  it('applies style guidance immediately when AI settings are saved', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Short post' } });
    saveAiSettings('Make it concise and warm.');

    expect(generateFit).toHaveBeenCalledTimes(3);
    expect(vi.mocked(generateFit).mock.calls.map(([options]) => options.spec.id).sort()).toEqual(['bluesky', 'linkedin', 'x']);
    expect(generateFit).toHaveBeenCalledWith(expect.objectContaining({ style: 'Make it concise and warm.' }));
  });

  it('does not apply style guidance to cards when the editor is empty', () => {
    render(<App />);

    // No editor content — only style guidance is configured.
    saveAiSettings('Make it concise and warm.');

    expect(generateFit).not.toHaveBeenCalled();
  });

  it('auto-fits over-limit platform text immediately when AI settings are saved', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'a'.repeat(400) } });
    saveAiSettings();

    expect(generateFit).toHaveBeenCalledTimes(2);
    expect(vi.mocked(generateFit).mock.calls.map(([options]) => options.spec.id).sort()).toEqual(['bluesky', 'x']);
  });
});