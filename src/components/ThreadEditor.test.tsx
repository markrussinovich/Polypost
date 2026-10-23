import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyPlainText } from '../lib/clipboard';
import { xSpec } from '../lib/platforms/x';
import { blueskySpec } from '../lib/platforms/bluesky';
import { threadsSpec } from '../lib/platforms/threads';
import type { PostThread } from '../lib/postThreads';
import { ThreadEditor } from './ThreadEditor';

vi.mock('../lib/clipboard', () => ({ copyPlainText: vi.fn(async () => {}) }));
afterEach(() => { cleanup(); vi.mocked(copyPlainText).mockReset(); vi.restoreAllMocks(); });

const initial: PostThread = { numbered: true, posts: [{ id: 'a', text: 'First post' }, { id: 'b', text: 'Second post' }] };

function setup(thread = initial, spec = xSpec) {
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = useState(thread);
    return <ThreadEditor spec={spec} thread={value} onChange={(next) => { changed(next); setValue(next); }} linkPreviews={new Map()} showLinkPreviews />;
  }
  render(<Harness />);
  return changed;
}

describe('thread editor', () => {
  it('edits each post, updates its count and copies precisely the numbered text', async () => {
    setup();
    expect(screen.queryByText(/Copy posts individually|Threads are not posted automatically|opening the composer does not link/i)).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'X post 1 text' }), { target: { value: 'Edited' } });
    const post = screen.getByRole('listitem', { name: 'X post 1' });
    expect(post.querySelector('.character-meter strong')).toHaveTextContent('11');
    await act(async () => { fireEvent.click(within(post).getByRole('button', { name: 'Copy post 1' })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('Edited\n\n1/2');
    expect(within(post).getByText('Copied!')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Number posts' })).toBeNull();
  });

  it('reorders posts without remounting their editors and recalculates numbering', async () => {
    setup();
    const first = screen.getByRole('textbox', { name: 'X post 1 text' });
    expect(screen.getByRole('button', { name: 'Move post 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move post 2 down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move post 1 down' }));
    expect(screen.getByRole('textbox', { name: 'X post 2 text' })).toBe(first);
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue('Second post');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy post 1' })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('Second post\n\n1/2');
    fireEvent.click(screen.getByRole('button', { name: 'Move post 2 up' }));
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toBe(first);
  });

  it('adds and removes posts without removing the last editor', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add post' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: 'X post 3 text' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'X post 3 text' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Copy post 3' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy & open post 3' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('empty');
    fireEvent.click(screen.getByRole('button', { name: 'Remove post 2' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove post 2' }));
    expect(screen.getByRole('button', { name: 'Remove post 1' })).toBeDisabled();
    expect(screen.getByText('1/1')).toBeInTheDocument();
  });

  it('flags over-limit edits including numbering without silently truncating them', () => {
    setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'X post 1 text' }), { target: { value: 'x'.repeat(280) } });
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveValue('x'.repeat(280));
    expect(screen.getByRole('status')).toHaveTextContent('Over the character limit');
    fireEvent.change(screen.getByRole('textbox', { name: 'X post 1 text' }), { target: { value: 'x'.repeat(275) } });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each([xSpec, blueskySpec, threadsSpec])('copies the selected numbered post and opens the $label composer', async (spec) => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => {
      expect(copyPlainText).toHaveBeenLastCalledWith('Second post\n\n2/2');
      return window;
    });
    setup(initial, spec);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy & open post 2' })); });
    expect(open).toHaveBeenCalledWith(spec.capabilities.openComposer!.url('Second post\n\n2/2'), '_blank');
    expect(window.opener).toBeNull();
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  it('opens the latest edited text with numbering rather than the original segment', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'X post 1 text' }), { target: { value: 'Updated text & link https://a.test' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy & open post 1' })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('Updated text & link https://a.test\n\n1/2');
    expect(open).toHaveBeenCalledWith(xSpec.capabilities.openComposer!.url('Updated text & link https://a.test\n\n1/2'), '_blank');
  });

  it('preserves the Threads emoji clipboard fallback when opening a thread segment', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    const text = '\u{1f680} Launch';
    setup({ numbered: false, posts: [{ id: 'emoji', text }] }, threadsSpec);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy & open post 1' })); });
    expect(copyPlainText).toHaveBeenLastCalledWith(`${text}\n\n1/1`);
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(open).toHaveBeenCalledWith('https://www.threads.com/intent/post', '_blank');
  });

  it('does not open a composer if copying fails', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    vi.mocked(copyPlainText).mockRejectedValueOnce(new Error('Clipboard denied'));
    setup();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy & open post 1' })); });
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText('Copy failed')).toBeInTheDocument();
  });

  it.each(['blocked', 'throws'])('reports a composer that $s without misreporting the successful copy', async (failure) => {
    vi.spyOn(window, 'open').mockImplementation(() => {
      if (failure === 'throws') throw new Error('Cannot open');
      return null;
    });
    setup();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy & open post 1' })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('First post\n\n1/2');
    expect(screen.getByText('Copied; open failed')).toBeInTheDocument();
  });

  it('keeps copy available without offering unsupported composer actions', () => {
    setup(initial, { ...xSpec, capabilities: { copy: true, threads: true } });
    expect(screen.getByRole('button', { name: 'Copy post 1' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Copy & open/ })).toBeNull();
  });

  it('copies a portable whole thread and surfaces clipboard failures', async () => {
    setup();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy entire thread' })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('First post\n\n1/2\n\n---\n\nSecond post\n\n2/2');
    vi.mocked(copyPlainText).mockRejectedValueOnce(new Error('Clipboard denied'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy post 1' })); });
    expect(screen.getByText('Copy failed')).toBeInTheDocument();
  });
});
