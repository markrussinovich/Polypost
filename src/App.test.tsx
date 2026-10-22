import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorNode } from './lib/exportText';
import type { LibraryDraft } from './lib/draftLibrary';

const library = vi.hoisted(() => ({ drafts: [] as LibraryDraft[], failWrites: false }));

vi.mock('./lib/draftLibrary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/draftLibrary')>()),
  listLibraryDrafts: vi.fn(async () => structuredClone(library.drafts)),
  saveLibraryDraft: vi.fn(async (draft: LibraryDraft) => {
    if (library.failWrites) throw new Error('Storage full');
    library.drafts = [structuredClone(draft), ...library.drafts.filter((entry) => entry.id !== draft.id)];
  }),
  deleteLibraryDraft: vi.fn(async (id: string) => {
    library.drafts = library.drafts.filter((entry) => entry.id !== id);
  }),
}));

vi.mock('./lib/ai/llmClient', () => ({
  generateText: vi.fn(async () => 'AI-authored post'),
  testConnection: vi.fn(),
}));

vi.mock('./lib/clipboard', () => ({
  copyPlainText: vi.fn(async () => {}),
  copyLinkedInText: vi.fn(async () => {}),
}));

vi.mock('./components/EditorShell', () => ({
  EditorShell: ({ initialContent, onDocumentChange, onReset }: { initialContent: EditorNode; onDocumentChange: (document: EditorNode) => void; onReset: () => void }) => (
    <div>
      <textarea
        aria-label="Mock post editor"
        defaultValue={initialContent.content?.[0]?.content?.[0]?.text ?? ''}
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
    truncated: false,
  })),
}));

import { generateFit } from './lib/ai/fit';
import { generateText } from './lib/ai/llmClient';
import { saveLibraryDraft } from './lib/draftLibrary';
import { copyPlainText } from './lib/clipboard';
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
    library.drafts = [];
    library.failWrites = false;
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { title: 'Preview title' } }),
    } as unknown as Response);
    vi.mocked(generateFit).mockClear();
    vi.mocked(generateText).mockClear();
    vi.mocked(saveLibraryDraft).mockClear();
    vi.mocked(copyPlainText).mockClear();
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

  it('applies style guidance immediately when AI settings are saved', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Short post' } });
    saveAiSettings('Make it concise and warm.');

    expect(generateFit).toHaveBeenCalledTimes(3);
    expect(vi.mocked(generateFit).mock.calls.map(([options]) => options.spec.id).sort()).toEqual(['bluesky', 'linkedin', 'x']);
    expect(generateFit).toHaveBeenCalledWith(expect.objectContaining({ style: 'Make it concise and warm.' }));
    await act(async () => {});
  });

  it('does not re-style platforms whose input has not changed', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Short post' } });
    saveAiSettings('Make it concise and warm.');

    expect(generateFit).toHaveBeenCalledTimes(3);

    // Suggestions should not be regenerated for identical input, even before acceptance.
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
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft' })); });
    vi.mocked(generateFit).mockClear();

    // Restore the snapshot (list button, then the dialog's confirm button).
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    const restoreButtons = screen.getAllByRole('button', { name: 'Restore' });
    await act(async () => { fireEvent.click(restoreButtons[restoreButtons.length - 1]); });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // The snapshot's AI versions came from its own inputs; the idle pass must
    // re-derive them rather than trust the pre-restore cache keys.
    expect(generateFit).toHaveBeenCalledTimes(3);
  });

  it('does not apply style guidance to cards when the editor is empty', async () => {
    render(<App />);

    // No editor content — only style guidance is configured.
    saveAiSettings('Make it concise and warm.');

    expect(generateFit).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it('asks for confirmation before resetting a draft with content', async () => {
    render(<App />);
    await act(async () => {});

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Precious draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mock reset' }));

    expect(screen.getByText('Reset draft?')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reset' })); });

    expect(screen.queryByText('Reset draft?')).toBeNull();
  });

  it('resets an empty draft without asking for confirmation', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Mock reset' }));

    expect(screen.queryByText('Reset draft?')).toBeNull();
    await act(async () => {});
  });

  it('asks for confirmation before restoring a saved draft over unsaved content', async () => {
    render(<App />);
    await act(async () => {});

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'First draft' } });
    fireEvent.click(screen.getByText('Saved drafts'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft' })); });
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Unsaved second draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(screen.getByText(/^Restore "/)).toBeTruthy();
  });

  it('auto-fits over-limit platform text immediately when AI settings are saved', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'a'.repeat(400) } });
    saveAiSettings();

    expect(generateFit).toHaveBeenCalledTimes(2);
    expect(vi.mocked(generateFit).mock.calls.map(([options]) => options.spec.id).sort()).toEqual(['bluesky', 'x']);
    await act(async () => {});
  });

  it('stages platform suggestions, accepts explicitly, and undoes without losing the master', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Original post' } });
    saveAiSettings('Friendly');
    await act(async () => {});

    const xCard = screen.getByLabelText('X preview');
    expect(xCard.querySelector('.platform-card-text')).toBeNull();
    expect(within(xCard).getByRole('region', { name: 'Tracked changes for X' })).toHaveTextContent('Original post');
    expect(within(xCard).getByText('Adapted')).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(xCard).getByRole('button', { name: /^(Copy|Copied!)$/ })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('Original post');

    await act(async () => { fireEvent.click(within(xCard).getByRole('button', { name: 'Accept All' })); });
    expect(xCard.querySelector('.platform-card-text')).toHaveTextContent('Adapted');
    await act(async () => { fireEvent.click(within(xCard).getByRole('button', { name: /^(Copy|Copied!)$/ })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('Adapted');
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('Original post');
    expect(library.drafts.some((draft) => draft.aiVersions?.x)).toBe(true);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo AI change' })); });
    expect(xCard.querySelector('.platform-card-text')).toHaveTextContent('Original post');
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('Original post');
  });

  it('persists accepted AI variants across reloads without automatically regenerating them', async () => {
    const app = render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Original post' } });
    saveAiSettings('Friendly');
    await act(async () => {});
    await act(async () => {
      fireEvent.click(within(screen.getByLabelText('X preview')).getByRole('button', { name: 'Accept All' }));
    });
    app.unmount();
    vi.mocked(generateFit).mockClear();
    render(<App />);
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByLabelText('X preview').querySelector('.platform-card-text')).toHaveTextContent('Adapted');
    expect(vi.mocked(generateFit).mock.calls.some(([options]) => options.spec.id === 'x')).toBe(false);
  });

  it('applies per-change decisions to the platform output and its recovery snapshot', async () => {
    vi.mocked(generateFit).mockResolvedValueOnce({
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My new post!' }] }] },
      text: 'My new post!', count: 12, withinLimit: true, attempts: 1, truncated: false,
    });
    window.localStorage.setItem('omnipost:workspace-v2', JSON.stringify({
      version: 2, master: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My old post.' }] }] },
      overrides: {}, enabledPlatforms: ['x'],
    }));
    render(<App />);
    saveAiSettings('Friendly');
    await act(async () => {});
    const card = screen.getByLabelText('X preview');
    fireEvent.click(within(card).getByRole('button', { name: 'Reject change 1' }));
    await act(async () => { fireEvent.click(within(card).getByRole('button', { name: 'Accept change 1' })); });
    expect(card.querySelector('.platform-card-text')).toHaveTextContent('My old post!');
    expect(library.drafts.some((draft) => draft.aiVersions?.x?.content?.[0]?.content?.[0]?.text === 'My old post!')).toBe(true);
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('My old post.');
  });

  it('rejects and regenerates suggestions without changing copied preview text', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Original post' } });
    saveAiSettings('Friendly');
    await act(async () => {});
    const card = screen.getByLabelText('X preview');
    const calls = vi.mocked(generateFit).mock.calls.length;
    await act(async () => { fireEvent.click(within(card).getByRole('button', { name: 'Suggest AI changes for X' })); });
    expect(generateFit).toHaveBeenCalledTimes(calls + 1);
    await act(async () => { fireEvent.click(within(card).getByRole('button', { name: 'Reject All' })); });
    expect(within(card).queryByRole('button', { name: 'Accept All' })).toBeNull();
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(generateFit).toHaveBeenCalledTimes(calls + 1);
    expect(card.querySelector('.platform-card-text')).toHaveTextContent('Original post');
  });

  it('reviews AI authoring and retains the original in recovery when accepted', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Original master' } });
    saveAiSettings();
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('AI instruction'), { target: { value: 'Rewrite it' } });
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByLabelText('Mock post editor')).toBeNull();
    const review = screen.getByRole('region', { name: 'Review AI changes for master draft' });
    expect(generateText).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(within(review).getByRole('button', { name: 'Accept All' })); });
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('AI-authored post');
    expect(library.drafts.some((draft) => draft.document.content?.[0]?.content?.[0]?.text === 'Original master')).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo AI change' })); });
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('Original master');
  });

  it('automatically puts an initial AI draft into the existing editor without a second draft area', async () => {
    render(<App />);
    saveAiSettings();
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('AI instruction'), { target: { value: 'Write a launch post' } });
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getAllByLabelText('Mock post editor')).toHaveLength(1);
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('AI-authored post');
    expect(screen.queryByRole('region', { name: 'Review AI changes for master draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
  });

  it('automatically adapts over-limit edits after a typing pause', async () => {
    render(<App />);
    saveAiSettings();
    await act(async () => {});
    vi.mocked(generateFit).mockClear();
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'x'.repeat(400) } });
    await act(async () => { vi.advanceTimersByTime(2999); });
    expect(generateFit).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(generateFit).toHaveBeenCalledTimes(2);
    expect(within(screen.getByLabelText('X preview')).getByRole('button', { name: 'Accept change 1' })).toBeInTheDocument();
  });

  it('does not apply an outstanding suggestion after the author edits the draft', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Original' } });
    saveAiSettings('Friendly');
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Newer manual edit' } });
    expect(screen.queryByRole('button', { name: 'Accept All' })).toBeNull();
    expect(screen.getByLabelText('X preview').querySelector('.platform-card-text')).toHaveTextContent('Newer manual edit');
  });

  it('ignores an in-flight AI result that resolves after a newer edit', async () => {
    let resolveFit!: (result: Awaited<ReturnType<typeof generateFit>>) => void;
    vi.mocked(generateFit).mockReturnValueOnce(new Promise((resolve) => { resolveFit = resolve; }));
    render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Original' } });
    saveAiSettings('Friendly');
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Newer manual edit' } });
    await act(async () => {
      resolveFit({
        doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stale result' }] }] },
        text: 'Stale result', count: 12, withinLimit: true, attempts: 1, truncated: false,
      });
    });
    expect(screen.queryByText('Stale result')).toBeNull();
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('Newer manual edit');
  });

  it('keeps the original text when recovery storage fails during AI acceptance', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Original' } });
    saveAiSettings('Friendly');
    await act(async () => {});
    library.failWrites = true;
    await act(async () => {
      fireEvent.click(within(screen.getByLabelText('X preview')).getByRole('button', { name: 'Accept All' }));
    });
    expect(screen.getByText(/Recovery checkpoint failed: Storage full/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('omnipost:workspace-v2')!).aiVersions?.x).toBeUndefined();
    expect(within(screen.getByLabelText('X preview')).getByRole('button', { name: 'Retry save' })).toBeEnabled();
  });

  it('discards an automatic suggestion if its accepted baseline was re-synced while it was generating', async () => {
    const document = (text: string): EditorNode => ({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    window.localStorage.setItem('omnipost:workspace-v2', JSON.stringify({
      version: 2, master: document('Original'), overrides: {}, enabledPlatforms: ['x'],
      aiVersions: { x: document('Previously accepted') },
    }));
    let resolveFit!: (result: Awaited<ReturnType<typeof generateFit>>) => void;
    vi.mocked(generateFit).mockReturnValueOnce(new Promise((resolve) => { resolveFit = resolve; }));
    render(<App />);
    saveAiSettings('Friendly');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Re-sync X from the master draft' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Re-sync' })); });
    await act(async () => {
      resolveFit({
        doc: document('Stale adaptation'), text: 'Stale adaptation',
        count: 16, withinLimit: true, attempts: 1, truncated: false,
      });
    });
    const card = screen.getByLabelText('X preview');
    expect(card.querySelector('.platform-card-text')).toHaveTextContent('Original');
    expect(within(card).queryByRole('button', { name: 'Accept changes' })).toBeNull();
  });

  it('updates a named draft in place and creates recovery checkpoints before resetting', async () => {
    render(<App />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Version one' } });
    fireEvent.click(screen.getByText('Saved drafts'));
    fireEvent.change(screen.getByLabelText('Draft name'), { target: { value: 'Launch' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft' })); });
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Version two' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update draft' })); });
    expect(library.drafts.filter((draft) => draft.kind === 'draft')).toHaveLength(1);
    expect(library.drafts[0].document.content?.[0]?.content?.[0]?.text).toBe('Version two');
    expect(library.drafts.some((draft) => draft.kind === 'recovery' && draft.document.content?.[0]?.content?.[0]?.text === 'Version one')).toBe(true);
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(library.drafts.some((draft) => draft.kind === 'recovery')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mock reset' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reset' })); });
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('');
    expect(library.drafts.some((draft) => draft.document.content?.[0]?.content?.[0]?.text === 'Version two')).toBe(true);
  });
});