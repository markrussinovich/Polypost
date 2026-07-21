import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorNode } from './lib/exportText';

vi.mock('./components/EditorShell', () => ({
  EditorShell: ({ onDocumentChange, onReset }: { onDocumentChange: (document: EditorNode) => void; onReset: () => void }) => (
    <div>
      <textarea
        aria-label="Mock post editor"
        onChange={(event) => {
          onDocumentChange({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: event.target.value }] }],
          });
        }}
      />
      <button type="button" onClick={onReset}>Mock reset</button>
    </div>
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

  it('does not re-style platforms whose input has not changed', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Short post' } });
    saveAiSettings('Make it concise and warm.');

    expect(generateFit).toHaveBeenCalledTimes(3);

    // Let the fit results apply, then trigger another idle pass with identical content.
    await act(async () => {});
    vi.mocked(generateFit).mockClear();

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Short post' } });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(generateFit).not.toHaveBeenCalled();
  });

  it('regenerates restored AI versions instead of wrongly skipping them', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Short post' } });
    saveAiSettings('Make it concise and warm.');
    expect(generateFit).toHaveBeenCalledTimes(3);
    await act(async () => {});

    fireEvent.click(screen.getByText('Saved drafts'));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    vi.mocked(generateFit).mockClear();

    // Restore the snapshot (list button, then the dialog's confirm button).
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    const restoreButtons = screen.getAllByRole('button', { name: 'Restore' });
    fireEvent.click(restoreButtons[restoreButtons.length - 1]);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // The snapshot's AI versions came from its own inputs; the idle pass must
    // re-derive them rather than trust the pre-restore cache keys.
    expect(generateFit).toHaveBeenCalledTimes(3);
  });

  it('does not apply style guidance to cards when the editor is empty', () => {
    render(<App />);

    // No editor content — only style guidance is configured.
    saveAiSettings('Make it concise and warm.');

    expect(generateFit).not.toHaveBeenCalled();
  });

  it('asks for confirmation before resetting a draft with content', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Precious draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mock reset' }));

    expect(screen.getByText('Reset draft?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.queryByText('Reset draft?')).toBeNull();
  });

  it('resets an empty draft without asking for confirmation', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Mock reset' }));

    expect(screen.queryByText('Reset draft?')).toBeNull();
  });

  it('asks for confirmation before restoring a saved draft over unsaved content', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'First draft' } });
    fireEvent.click(screen.getByText('Saved drafts'));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Unsaved second draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(screen.getByText(/^Restore "/)).toBeTruthy();
  });

  it('auto-fits over-limit platform text immediately when AI settings are saved', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'a'.repeat(400) } });
    saveAiSettings();

    expect(generateFit).toHaveBeenCalledTimes(2);
    expect(vi.mocked(generateFit).mock.calls.map(([options]) => options.spec.id).sort()).toEqual(['bluesky', 'x']);
  });
});