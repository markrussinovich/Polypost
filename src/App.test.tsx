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
  generateThread: vi.fn(async ({ masterText }: { masterText: string }) => ({
    type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: masterText }] }],
  })),
  generateFit: vi.fn(async () => ({
    doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Adapted' }] }] },
    text: 'Adapted',
    count: 7,
    withinLimit: true,
    attempts: 1,
    truncated: false,
  })),
}));

import { generateFit, generateThread } from './lib/ai/fit';
import { generateText } from './lib/ai/llmClient';
import { saveLibraryDraft } from './lib/draftLibrary';
import { copyPlainText } from './lib/clipboard';
import { defaultLlmConfig } from './lib/ai/config';
import { parsePlatformThreads, renderThreadPost, splitThreadText } from './lib/postThreads';
import { xSpec } from './lib/platforms/x';
import { renderForPlatform } from './lib/platforms';
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

const threadTestSource = 'Full original draft. '.repeat(20).trim();
const firstThreadTestPost = splitThreadText(threadTestSource, xSpec)[0];

function storeThreadTestDraft(text = threadTestSource) {
  window.localStorage.setItem('omnipost:workspace-v2', JSON.stringify({
    version: 2, master: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    overrides: {}, enabledPlatforms: ['x'],
  }));
  window.localStorage.setItem('omnipost:llm-config-v1', JSON.stringify({
    ...defaultLlmConfig(), enabled: true, apiKey: 'test', autoFit: false,
  }));
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
    vi.mocked(generateThread).mockClear();
    vi.mocked(generateText).mockClear();
    vi.mocked(saveLibraryDraft).mockClear();
    vi.mocked(copyPlainText).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('updates the main draft word count as text is written and cleared', async () => {
    render(<App />);
    const count = screen.getByLabelText('Main draft word count');
    expect(count).toHaveTextContent('0 words');
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Hello' } });
    expect(count).toHaveTextContent('1 word');
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Hello, world!\nA new paragraph.' } });
    expect(count).toHaveTextContent('5 words');
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: '' } });
    expect(count).toHaveTextContent('0 words');
    await act(async () => {});
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

  it('automatically applies platform adaptations without showing tracked changes', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Original post' } });
    saveAiSettings('Friendly');
    await act(async () => {});

    const xCard = screen.getByLabelText('X preview');
    expect(xCard.querySelector('.platform-card-text')).toHaveTextContent('Adapted');
    expect(within(xCard).queryByRole('region', { name: 'Tracked changes for X' })).toBeNull();
    expect(within(xCard).getByText('Adapted')).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(xCard).getByRole('button', { name: /^(Copy|Copied!)$/ })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('Adapted');
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('Original post');
    expect(JSON.parse(window.localStorage.getItem('omnipost:workspace-v2')!).aiVersions.x).toBeDefined();
  });

  it('persists accepted AI variants across reloads without automatically regenerating them', async () => {
    const app = render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Original post' } });
    saveAiSettings('Friendly');
    await act(async () => {});
    app.unmount();
    vi.mocked(generateFit).mockClear();
    render(<App />);
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByLabelText('X preview').querySelector('.platform-card-text')).toHaveTextContent('Adapted');
    expect(vi.mocked(generateFit).mock.calls.some(([options]) => options.spec.id === 'x')).toBe(false);
  });

  it('reviews individual changes only in the main draft and updates platform output after review', async () => {
    vi.mocked(generateText).mockResolvedValueOnce('My new post!');
    window.localStorage.setItem('omnipost:workspace-v2', JSON.stringify({
      version: 2, master: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My old post.' }] }] },
      overrides: {}, enabledPlatforms: ['x'],
    }));
    render(<App />);
    saveAiSettings();
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('AI instruction'), { target: { value: 'Rewrite' } });
    await act(async () => { vi.advanceTimersByTime(3000); });
    const card = screen.getByLabelText('X preview');
    expect(within(card).queryByRole('region', { name: 'Tracked changes for X' })).toBeNull();
    expect(within(card).getByRole('switch')).toBeDisabled();
    fireEvent.contextMenu(screen.getByRole('group', { name: 'Change 1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reject change' }));
    fireEvent.click(screen.getByRole('group', { name: 'Change 1' }));
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Accept change' })); });
    expect(card.querySelector('.platform-card-text')).toHaveTextContent('My old post.');
    expect(library.drafts.some((draft) => draft.document.content?.[0]?.content?.[0]?.text === 'My old post!')).toBe(true);
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('My old post!');
    await act(async () => { vi.advanceTimersByTime(2999); });
    expect(card.querySelector('.platform-card-text')).toHaveTextContent('My old post.');
    expect(within(card).getByRole('switch')).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(card.querySelector('.platform-card-text')).toHaveTextContent('My old post!');
    expect(within(card).getByRole('switch')).toBeDisabled();
  });

  it('pauses platform adaptation during generation and review, then restarts the full idle delay', async () => {
    let resolveAuthor!: (text: string) => void;
    vi.mocked(generateText).mockReturnValueOnce(new Promise((resolve) => { resolveAuthor = resolve; }));
    render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Original master' } });
    saveAiSettings('Friendly');
    await act(async () => {});
    vi.mocked(generateFit).mockClear();
    fireEvent.change(screen.getByLabelText('AI instruction'), { target: { value: 'Rewrite' } });
    fireEvent.keyDown(screen.getByLabelText('AI instruction'), { key: 'Enter' });
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(generateFit).not.toHaveBeenCalled();
    await act(async () => { resolveAuthor('Final revised draft'); });
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(generateFit).not.toHaveBeenCalled();
    const card = screen.getByLabelText('X preview');
    expect(card.querySelector('.platform-card-text')).toHaveTextContent('Adapted');
    expect(within(card).getByRole('switch')).toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept All' })); });
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('Final revised draft');
    await act(async () => { vi.advanceTimersByTime(2999); });
    expect(generateFit).not.toHaveBeenCalled();
    expect(card.querySelector('.platform-card-text')).toHaveTextContent('Adapted');
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(generateFit).toHaveBeenCalledTimes(3);
    expect(generateFit).toHaveBeenCalledWith(expect.objectContaining({ masterText: 'Final revised draft' }));
  });

  it('manually regenerates platform output without review markup', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Original post' } });
    saveAiSettings('Friendly');
    await act(async () => {});
    const card = screen.getByLabelText('X preview');
    const calls = vi.mocked(generateFit).mock.calls.length;
    await act(async () => { fireEvent.click(within(card).getByRole('button', { name: 'Suggest AI changes for X' })); });
    expect(generateFit).toHaveBeenCalledTimes(calls + 1);
    expect(within(card).queryByRole('button', { name: 'Accept All' })).toBeNull();
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(generateFit).toHaveBeenCalledTimes(calls + 1);
    expect(card.querySelector('.platform-card-text')).toHaveTextContent('Adapted');
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
    expect(screen.queryByRole('button', { name: 'Undo AI change' })).toBeNull();
    expect(screen.queryByText(/AI changes accepted/)).toBeNull();
  });

  it('keeps Unicode bullet lines separate when an AI-authored draft reaches platform previews', async () => {
    render(<App />);
    saveAiSettings();
    await act(async () => {});
    const reply = 'Highlights:\n\n\u2022 Plaza Mayor.\n\u2022 Two cathedrals.\n\u2022 The University, founded 1218.';
    vi.mocked(generateText).mockResolvedValueOnce(reply);
    fireEvent.change(screen.getByLabelText('AI instruction'), { target: { value: 'Write some highlights' } });
    await act(async () => { fireEvent.keyDown(screen.getByLabelText('AI instruction'), { key: 'Enter' }); });
    const stored = JSON.parse(window.localStorage.getItem('omnipost:workspace-v2')!);
    expect(renderForPlatform(stored.master, xSpec).text).toBe(reply);
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByLabelText('X preview').querySelector('.platform-card-text')?.textContent).toBe(reply);
    expect(screen.getByLabelText('Bluesky preview').querySelector('.platform-card-text')?.textContent).toBe(reply);
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
    expect(screen.getByLabelText('X preview').querySelector('.platform-card-text')).not.toHaveTextContent('AI-authored post');
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByLabelText('X preview').querySelector('.platform-card-text')).toHaveTextContent('AI-authored post');
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
    expect(screen.getByLabelText('X preview').querySelector('.platform-card-text')).toHaveTextContent('Adapted');
    expect(within(screen.getByLabelText('X preview')).queryByRole('group', { name: 'Change 1' })).toBeNull();
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
    saveAiSettings();
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('AI instruction'), { target: { value: 'Rewrite' } });
    await act(async () => { vi.advanceTimersByTime(3000); });
    library.failWrites = true;
    await act(async () => {
      fireEvent.click(within(screen.getByRole('region', { name: 'Review AI changes for master draft' })).getByRole('button', { name: 'Accept All' }));
    });
    expect(screen.getByText(/Recovery checkpoint failed: Storage full/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('omnipost:workspace-v2')!).aiVersions?.x).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Retry save' })).toBeEnabled();
  });

  it('splits the full draft instead of its shortened AI variant and protects the thread from further adaptation', async () => {
    render(<App />);
    const original = 'Keep the full message, not a summary. '.repeat(20).trim();
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: original } });
    saveAiSettings('Friendly');
    await act(async () => {});
    const card = screen.getByLabelText('X preview');
    expect(card.querySelector('.platform-card-text')).toHaveTextContent('Adapted');
    await act(async () => { fireEvent.click(within(card).getByRole('switch')); });
    const posts = within(card).getAllByRole<HTMLTextAreaElement>('textbox');
    expect(posts.length).toBeGreaterThan(1);
    expect(card).not.toHaveClass('is-over');
    expect(posts.map((post) => post.value).join(' ').replace(/\s+/g, ' ')).toBe(original);
    expect(within(card).getAllByRole('button', { name: /^Copy & open post \d+$/ })).toHaveLength(posts.length);
    expect(within(card).getByRole('button', { name: 'Suggest AI changes for X' })).toBeEnabled();
    expect(generateThread).toHaveBeenCalledWith(expect.objectContaining({ masterText: original }));
    fireEvent.change(within(card).getByRole('textbox', { name: 'X post 1 text' }), { target: { value: 'My edited first post' } });
    const edited = within(card).getAllByRole<HTMLTextAreaElement>('textbox').map((post) => post.value);
    vi.mocked(generateFit).mockClear();
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Updated main draft' } });
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(vi.mocked(generateFit).mock.calls.map(([options]) => options.spec.id).sort()).toEqual(['bluesky', 'linkedin']);
    expect(within(card).getAllByRole<HTMLTextAreaElement>('textbox').map((post) => post.value)).toEqual(edited);
    expect(generateThread).toHaveBeenCalledTimes(1);
  });

  it('shows the live post count beside the thread toggle without a separate count row', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'x'.repeat(300) } });
    const card = screen.getByLabelText('X preview');
    const toggle = within(card).getByRole('switch');
    const mode = toggle.closest('.post-thread-mode')!;
    expect(mode).not.toHaveTextContent(/\d+ posts?/);
    fireEvent.click(toggle);
    expect(mode).toHaveTextContent('2 posts');
    expect(card.querySelector('.post-thread-toolbar')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Add post' }));
    expect(mode).toHaveTextContent('3 posts');
    fireEvent.click(within(card).getByRole('button', { name: 'Remove post 2' }));
    expect(mode).toHaveTextContent('2 posts');
    await act(async () => {});
  });

  it('persists thread edits, ordering and numbering through reload, saved drafts, hidden platforms and restore', async () => {
    const app = render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'A full draft. '.repeat(50) } });
    const card = screen.getByLabelText('X preview');
    fireEvent.click(within(card).getByRole('switch'));
    fireEvent.change(within(card).getByRole('textbox', { name: 'X post 1 text' }), { target: { value: 'Edited first segment' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Move post 1 down' }));
    const stored = JSON.parse(window.localStorage.getItem('omnipost:workspace-v2')!);
    expect(stored.threads.x.posts[1].text).toBe('Edited first segment');
    expect(stored.threads.x.numbered).toBe(true);
    app.unmount();
    render(<App />);
    expect(screen.getByRole('textbox', { name: 'X post 2 text' })).toHaveValue('Edited first segment');
    const chips = screen.getByRole('group', { name: 'Platforms to preview' });
    fireEvent.click(within(chips).getByRole('button', { name: /^X/ }));
    expect(screen.queryByLabelText('X preview')).toBeNull();
    expect(within(chips).getByLabelText('Has a saved customization')).toBeInTheDocument();
    fireEvent.click(within(chips).getByRole('button', { name: /^X/ }));
    expect(screen.getByRole('textbox', { name: 'X post 2 text' })).toHaveValue('Edited first segment');
    await act(async () => {});
    fireEvent.click(screen.getByText('Saved drafts'));
    fireEvent.change(screen.getByLabelText('Draft name'), { target: { value: 'Thread launch' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft' })); });
    expect(library.drafts.find((draft) => draft.kind === 'draft')?.threads).toEqual(stored.threads);
    fireEvent.click(screen.getByRole('button', { name: 'Re-sync X from the master draft' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('thread');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Re-sync' })); });
    expect(screen.queryByRole('group', { name: 'X thread' })).toBeNull();
    expect(library.drafts.some((draft) => draft.kind === 'recovery' && draft.threads?.x?.posts[1].text === 'Edited first segment')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    const restore = screen.getAllByRole('button', { name: 'Restore' });
    await act(async () => { fireEvent.click(restore[restore.length - 1]); });
    expect(screen.getByRole('textbox', { name: 'X post 2 text' })).toHaveValue('Edited first segment');
    expect(screen.queryByRole('checkbox', { name: 'Number posts' })).toBeNull();
    expect(screen.getByText(`2/${stored.threads.x.posts.length}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mock reset' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reset' })); });
    expect(screen.queryByRole('group', { name: 'X thread' })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('omnipost:workspace-v2')!).threads).toEqual({});
  });

  it('does not let an in-flight AI fit overwrite a newly created thread', async () => {
    window.localStorage.setItem('omnipost:workspace-v2', JSON.stringify({
      version: 2, master: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: threadTestSource }] }] },
      overrides: {}, enabledPlatforms: ['x'],
    }));
    let resolveFit!: (result: Awaited<ReturnType<typeof generateFit>>) => void;
    vi.mocked(generateFit).mockReturnValueOnce(new Promise((resolve) => { resolveFit = resolve; }));
    render(<App />);
    saveAiSettings('Friendly');
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => {
      resolveFit({
        doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stale fit' }] }] },
        text: 'Stale fit', count: 9, withinLimit: true, attempts: 1, truncated: false,
      });
    });
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue(firstThreadTestPost);
    expect(JSON.parse(window.localStorage.getItem('omnipost:workspace-v2')!).aiVersions.x).toBeUndefined();
    vi.mocked(generateFit).mockClear();
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(generateFit).not.toHaveBeenCalled();
  });

  it('uses a platform customization as the thread source and supports only X, Bluesky and Threads', async () => {
    const document = (text: string): EditorNode => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
    window.localStorage.setItem('omnipost:workspace-v2', JSON.stringify({
      version: 2, master: document('Master '.repeat(100).trim()), overrides: { x: document(threadTestSource) },
      enabledPlatforms: ['linkedin', 'x', 'bluesky', 'threads', 'mastodon', 'facebook', 'instagram'],
    }));
    render(<App />);
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    screen.getAllByRole('switch').forEach((toggle) => expect(toggle).not.toBeChecked());
    fireEvent.click(within(screen.getByLabelText('X preview')).getByRole('switch'));
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue(firstThreadTestPost);
    expect(screen.getByLabelText('Mock post editor')).toHaveValue('Master '.repeat(100).trim());
    fireEvent.click(within(screen.getByLabelText('Bluesky preview')).getByRole('switch'));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Bluesky post 1 text' }).value).toContain('Master');
    fireEvent.click(within(screen.getByLabelText('Threads preview')).getByRole('switch'));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Threads post 1 text' }).value).toContain('Master');
    await act(async () => {});
  });

  it('regenerates full-length text when the default-off toggle is enabled and fits again when disabled', async () => {
    const source = 'Full original fact. '.repeat(50).trim();
    const generated = 'A fully rewritten fact, without dropping details. '.repeat(40).trim();
    storeThreadTestDraft(source);
    vi.mocked(generateThread).mockResolvedValueOnce({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: generated }] }],
    });
    render(<App />);
    await act(async () => {});
    const toggle = screen.getByRole('switch', { name: 'Split X into a thread' });
    expect(toggle).not.toBeChecked();
    expect(generateFit).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(toggle); });
    expect(toggle).toBeChecked();
    expect(generateThread).toHaveBeenCalledWith(expect.objectContaining({ masterText: source, spec: expect.objectContaining({ id: 'x' }) }));
    const card = screen.getByLabelText('X preview');
    expect(within(card).getAllByRole<HTMLTextAreaElement>('textbox').map((post) => post.value).join(' ').replace(/\s+/g, ' ')).toBe(generated);
    expect(generateFit).not.toHaveBeenCalled();
    const savedThread = parsePlatformThreads(JSON.parse(window.localStorage.getItem('omnipost:workspace-v2')!).threads).x!;
    expect(savedThread.customized).toBe(false);
    expect(savedThread.posts.length).toBeGreaterThan(1);
    savedThread.posts.forEach((_, index) => {
      expect(renderThreadPost(savedThread, index, xSpec).summary.count).toBeLessThanOrEqual(xSpec.charLimit);
    });
    await act(async () => { fireEvent.click(toggle); });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole('group', { name: 'X thread' })).toBeNull();
    expect(generateFit).toHaveBeenCalledWith(expect.objectContaining({ masterText: source }));
    expect(card.querySelector('.platform-card-text')).toHaveTextContent('Adapted');
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(generateThread).toHaveBeenCalledTimes(1);
    expect(generateFit).toHaveBeenCalledTimes(1);
  });

  it('refreshes automatic threads only after the main review is final and the full idle delay has elapsed', async () => {
    storeThreadTestDraft();
    render(<App />);
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(generateThread).toHaveBeenCalledTimes(1);
    vi.mocked(generateText).mockResolvedValueOnce('A revised full draft with more details.');
    fireEvent.change(screen.getByLabelText('AI instruction'), { target: { value: 'Revise' } });
    await act(async () => { fireEvent.keyDown(screen.getByLabelText('AI instruction'), { key: 'Enter' }); });
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(generateThread).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue(firstThreadTestPost);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept All' })); });
    await act(async () => { vi.advanceTimersByTime(2999); });
    expect(generateThread).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue(firstThreadTestPost);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(generateThread).toHaveBeenCalledTimes(2);
    expect(generateThread).toHaveBeenLastCalledWith(expect.objectContaining({ masterText: 'A revised full draft with more details.' }));
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue('A revised full draft with more details.');
    expect(generateFit).not.toHaveBeenCalled();
  });

  it('always numbers generated threads and continues following later master edits', async () => {
    storeThreadTestDraft();
    let resolveThread!: (doc: EditorNode) => void;
    vi.mocked(generateThread).mockReturnValueOnce(new Promise((resolve) => { resolveThread = resolve; }));
    render(<App />);
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => {
      resolveThread({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full AI rewrite' }] }] });
    });
    expect(screen.queryByRole('checkbox', { name: 'Number posts' })).toBeNull();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue('Full AI rewrite');
    expect(JSON.parse(window.localStorage.getItem('omnipost:workspace-v2')!).threads.x.customized).toBe(false);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'New full draft' } });
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(generateThread).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue('New full draft');
    expect(screen.getByText('1/1')).toBeInTheDocument();
  });

  it('discards a delayed full-text reply after thread mode has been turned off', async () => {
    storeThreadTestDraft();
    let resolveThread!: (doc: EditorNode) => void;
    vi.mocked(generateThread).mockReturnValueOnce(new Promise((resolve) => { resolveThread = resolve; }));
    render(<App />);
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    await act(async () => { fireEvent.click(toggle); });
    expect(toggle).not.toBeChecked();
    await act(async () => {
      resolveThread({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stale full-text reply' }] }] });
    });
    expect(screen.queryByRole('group', { name: 'X thread' })).toBeNull();
    expect(screen.getByLabelText('X preview').querySelector('.platform-card-text')).toHaveTextContent('Adapted');
    expect(JSON.parse(window.localStorage.getItem('omnipost:workspace-v2')!).threads.x).toBeUndefined();
  });

  it('protects edits made while the full-text request is running and saves recovery before switching them off', async () => {
    storeThreadTestDraft();
    let resolveThread!: (doc: EditorNode) => void;
    vi.mocked(generateThread).mockReturnValueOnce(new Promise((resolve) => { resolveThread = resolve; }));
    render(<App />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.change(screen.getByRole('textbox', { name: 'X post 1 text' }), { target: { value: 'My custom thread text' } });
    await act(async () => {
      resolveThread({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stale rewrite' }] }] });
    });
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue('My custom thread text');
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Updated main draft' } });
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(generateThread).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue('My custom thread text');
    expect(screen.getByRole('switch')).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(library.drafts.some((draft) => draft.kind === 'recovery' && draft.threads?.x?.posts[0].text === 'My custom thread text')).toBe(true);
  });

  it('leaves customized thread mode on when saving recovery fails', async () => {
    storeThreadTestDraft();
    render(<App />);
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    fireEvent.change(screen.getByRole('textbox', { name: 'X post 1 text' }), { target: { value: 'Irreplaceable thread edit' } });
    library.failWrites = true;
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(screen.getByText('Recovery checkpoint failed: Storage full')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue('Irreplaceable thread edit');
    expect(generateFit).not.toHaveBeenCalled();
  });

  it('keeps thread mode independent for each supported platform and persists those choices', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'A full draft for every platform. '.repeat(20) } });
    fireEvent.click(screen.getByRole('button', { name: 'Threads' }));
    const x = screen.getByRole('switch', { name: 'Split X into a thread' });
    const bluesky = screen.getByRole('switch', { name: 'Split Bluesky into a thread' });
    const threads = screen.getByRole('switch', { name: 'Split Threads into a thread' });
    expect(x).not.toBeChecked();
    expect(bluesky).not.toBeChecked();
    expect(threads).not.toBeChecked();
    fireEvent.click(x);
    fireEvent.click(threads);
    expect(bluesky).not.toBeChecked();
    cleanup();
    render(<App />);
    expect(screen.getByRole('switch', { name: 'Split X into a thread' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Split Bluesky into a thread' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Split Threads into a thread' })).toBeChecked();
    await act(async () => {});
  });

  it('clears an automatic thread after its full source is erased without asking AI to invent content', async () => {
    storeThreadTestDraft();
    render(<App />);
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(generateThread).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: '' } });
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue('');
    expect(generateThread).toHaveBeenCalledTimes(1);
  });

  it('reports a thread-generation failure and allows explicit full-text regeneration', async () => {
    storeThreadTestDraft();
    vi.mocked(generateThread).mockRejectedValueOnce(new Error('Thread generation failed'));
    render(<App />);
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(screen.getByText('X: Thread generation failed')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue(firstThreadTestPost);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Suggest AI changes for X' })); });
    expect(generateThread).toHaveBeenCalledTimes(2);
    expect(generateFit).not.toHaveBeenCalled();
    expect(screen.queryByText('X: Thread generation failed')).toBeNull();
  });

  it('disables thread mode for an empty draft and locally follows over-limit text without AI', async () => {
    render(<App />);
    const toggle = within(screen.getByLabelText('X preview')).getByRole('switch');
    expect(toggle).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: threadTestSource } });
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'All the source detail. '.repeat(50).trim() } });
    await act(async () => { vi.advanceTimersByTime(2999); });
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue(firstThreadTestPost);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(within(screen.getByLabelText('X preview')).getAllByRole('textbox').length).toBeGreaterThan(1);
    expect(generateThread).not.toHaveBeenCalled();
    expect(generateFit).not.toHaveBeenCalled();
  });

  it('enables thread splitting only above each platform limit, not at the warning threshold or exact limit', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Threads' }));
    const x = screen.getByRole('switch', { name: 'Split X into a thread' });
    const bluesky = screen.getByRole('switch', { name: 'Split Bluesky into a thread' });
    const threads = screen.getByRole('switch', { name: 'Split Threads into a thread' });
    for (const [length, xEnabled, blueskyEnabled, threadsEnabled] of [
      [260, false, false, false], [280, false, false, false], [281, true, false, false],
      [300, true, false, false], [301, true, true, false],
      [500, true, true, false], [501, true, true, true],
    ] as const) {
      fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'x'.repeat(length) } });
      expect(x).toHaveProperty('disabled', !xEnabled);
      expect(bluesky).toHaveProperty('disabled', !blueskyEnabled);
      expect(threads).toHaveProperty('disabled', !threadsEnabled);
    }
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: 'Short again' } });
    expect(x).toBeDisabled();
    expect(bluesky).toBeDisabled();
    expect(threads).toBeDisabled();
    expect(generateThread).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it('uses platform-aware URL and emoji counts for thread eligibility', async () => {
    render(<App />);
    const x = screen.getByRole('switch', { name: 'Split X into a thread' });
    const bluesky = screen.getByRole('switch', { name: 'Split Bluesky into a thread' });
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: '\u{1f600}'.repeat(141) } });
    expect(x).toBeEnabled();
    expect(bluesky).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Mock post editor'), { target: { value: `https://example.com/${'a'.repeat(600)}` } });
    expect(x).toBeDisabled();
    expect(bluesky).toBeEnabled();
    await act(async () => {});
  });

  it('uses the full platform override rather than the master when checking whether threading is needed', async () => {
    window.localStorage.setItem('omnipost:workspace-v2', JSON.stringify({
      version: 2,
      master: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(500) }] }] },
      overrides: { x: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Short custom draft' }] }] } },
      enabledPlatforms: ['x', 'bluesky'],
    }));
    render(<App />);
    expect(screen.getByRole('switch', { name: 'Split X into a thread' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Split Bluesky into a thread' })).toBeEnabled();
    await act(async () => {});
  });

  it('fetches previews for each thread post instead of the inactive single-post version', async () => {
    window.localStorage.setItem('omnipost:workspace-v2', JSON.stringify({
      version: 2, master: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'https://example.test/inactive' }] }] },
      overrides: {}, enabledPlatforms: ['x'],
      threads: { x: { numbered: true, posts: [{ id: 'a', text: 'https://example.test/first' }, { id: 'b', text: 'https://example.test/second' }] } },
    }));
    render(<App />);
    await act(async () => { vi.advanceTimersByTime(2999); });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.microlink.io/?screenshot=true&url=https%3A%2F%2Fexample.test%2Ffirst',
      'https://api.microlink.io/?screenshot=true&url=https%3A%2F%2Fexample.test%2Fsecond',
    ]);
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