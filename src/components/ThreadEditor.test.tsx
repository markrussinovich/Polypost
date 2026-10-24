import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy post 1' })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('Edited\n\n1/2');
    expect(screen.getByRole('status')).toHaveTextContent('Post 1 copied!');
    expect(screen.getByRole('textbox', { name: 'X post 2 text' })).toHaveValue('Second post');
    expect(post).not.toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'Number posts' })).toBeNull();
  });

  it.each([xSpec, blueskySpec, threadsSpec])('omits unnecessary thread controls for $label while keeping navigation and removal', (spec) => {
    setup(initial, spec);
    expect(screen.queryByRole('button', { name: /Move post \d+ (up|down)/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add post' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy entire thread' })).toBeNull();
    expect(screen.getByRole('button', { name: `Previous ${spec.label} thread post` })).toBeEnabled();
    expect(screen.getByRole('button', { name: `Next ${spec.label} thread post` })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove post 1' })).toBeEnabled();
  });

  it('removes posts without removing the last editor and disables copying empty posts', () => {
    setup({ ...initial, posts: [...initial.posts, { id: 'c', text: '' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Previous X thread post' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getAllByRole('textbox', { hidden: true })).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: 'X post 3 text' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Copy post 3' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy & open post 3' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('empty');
    fireEvent.click(screen.getByRole('button', { name: 'Remove post 3' }));
    expect(screen.getAllByRole('textbox', { hidden: true })).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: 'X post 2 text' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Remove post 2' }));
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toHaveFocus();
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
    fireEvent.click(screen.getByRole('button', { name: `Next ${spec.label} thread post` }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy & open post 2' })); });
    expect(open).toHaveBeenCalledWith(spec.capabilities.openComposer!.url('Second post\n\n2/2'), '_blank');
    expect(window.opener).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Post 2 copied!');
    expect(screen.getByRole('textbox', { name: `${spec.label} post 1 text` })).toBeVisible();
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
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toBeVisible();
  });

  it.each(['blocked', 'throws'])('reports a composer that $s without misreporting the successful copy', async (failure) => {
    vi.spyOn(window, 'open').mockImplementation(() => {
      if (failure === 'throws') throw new Error('Cannot open');
      return null;
    });
    setup();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy & open post 1' })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('First post\n\n1/2');
    expect(screen.getByRole('status')).toHaveTextContent('Post 1 copied; open failed');
    expect(screen.getByRole('textbox', { name: 'X post 2 text' })).toBeVisible();
  });

  it('keeps copy available without offering unsupported composer actions', () => {
    setup(initial, { ...xSpec, capabilities: { copy: true, threads: true } });
    expect(screen.getByRole('button', { name: 'Copy post 1' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Copy & open/ })).toBeNull();
  });

  it('surfaces clipboard failures without advancing to another post', async () => {
    setup();
    vi.mocked(copyPlainText).mockRejectedValueOnce(new Error('Clipboard denied'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy post 1' })); });
    expect(screen.getByText('Copy failed')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'X post 1 text' })).toBeVisible();
  });

  it('shows only one card and wraps in both directions without losing edits or editor identity', () => {
    const changed = setup();
    const first = screen.getByRole('textbox', { name: 'X post 1 text' });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Post 1 of 2')).toBeVisible();
    const previous = screen.getByRole('button', { name: 'Previous X thread post' });
    const next = screen.getByRole('button', { name: 'Next X thread post' });
    previous.focus();
    fireEvent.click(previous);
    expect(previous).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'X post 2 text' })).toHaveValue('Second post');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited second post' } });
    fireEvent.click(next);
    expect(screen.getByRole('textbox')).toBe(first);
    fireEvent.click(next);
    expect(screen.getByRole('textbox')).toHaveValue('Edited second post');
    fireEvent.click(next);
    expect(screen.getByRole('textbox')).toBe(first);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it.each([xSpec, blueskySpec, threadsSpec])('advances after each copy and wraps to the first $label post without losing button focus', async (spec) => {
    const changed = setup({ ...initial, posts: [...initial.posts, { id: 'c', text: 'Third post' }] }, spec);
    const copyButton = screen.getByRole('button', { name: 'Copy post 1' });
    copyButton.focus();
    for (let index = 0; index < 3; index++) {
      await act(async () => { fireEvent.click(copyButton); });
      expect(copyPlainText).toHaveBeenLastCalledWith(`${['First post', 'Second post', 'Third post'][index]}\n\n${index + 1}/3`);
      expect(screen.getByText(`Post ${(index + 1) % 3 + 1} of 3`)).toBeVisible();
      expect(screen.getAllByRole('textbox')).toHaveLength(1);
      expect(copyButton).toHaveFocus();
    }
    expect(screen.getByRole('textbox')).toHaveValue('First post');
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps a single-post thread on its only card after copying and disables navigation', async () => {
    setup({ ...initial, posts: [initial.posts[0]] });
    expect(screen.getByRole('button', { name: 'Previous X thread post' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next X thread post' })).toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy post 1' })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('First post\n\n1/1');
    expect(screen.getByRole('textbox')).toHaveValue('First post');
    expect(screen.getByRole('status')).toHaveTextContent('Post 1 copied!');
  });

  it('selects and focuses the next card after removing the first or middle card', () => {
    setup({ ...initial, posts: [...initial.posts, { id: 'c', text: 'Third post' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Next X thread post' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove post 2' }));
    expect(screen.getByRole('textbox')).toHaveValue('Third post');
    expect(screen.getByRole('textbox')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Next X thread post' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove post 1' }));
    expect(screen.getByRole('textbox')).toHaveValue('Third post');
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(screen.getByText('Post 1 of 1')).toBeVisible();
  });

  it('disables duplicate copy actions and does not override navigation during a pending copy', async () => {
    let resolveCopy!: () => void;
    vi.mocked(copyPlainText).mockImplementationOnce(() => new Promise((resolve) => { resolveCopy = resolve; }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Copy post 1' }));
    expect(screen.getByRole('button', { name: 'Copy post 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy & open post 1' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next X thread post' }));
    await act(async () => { resolveCopy(); });
    expect(screen.getByRole('textbox')).toHaveValue('Second post');
    expect(screen.getByRole('button', { name: 'Copy post 2' })).toBeEnabled();
    expect(copyPlainText).toHaveBeenCalledTimes(1);
  });

  it('does not advance past edits made while copying', async () => {
    let resolveCopy!: () => void;
    vi.mocked(copyPlainText).mockImplementationOnce(() => new Promise((resolve) => { resolveCopy = resolve; }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Copy post 1' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Newer edit' } });
    await act(async () => { resolveCopy(); });
    expect(copyPlainText).toHaveBeenLastCalledWith('First post\n\n1/2');
    expect(screen.getByRole('textbox')).toHaveValue('Newer edit');
  });

  it('returns to the first card when the thread is regenerated and ignores a pending copy of the old thread', async () => {
    let resolveCopy!: () => void;
    vi.mocked(copyPlainText).mockImplementationOnce(() => new Promise((resolve) => { resolveCopy = resolve; }));
    const props = { spec: xSpec, onChange: vi.fn(), linkPreviews: new Map(), showLinkPreviews: true };
    const view = render(<ThreadEditor {...props} thread={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next X thread post' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy post 2' }));
    view.rerender(<ThreadEditor {...props} thread={{ ...initial, posts: [{ id: 'new-a', text: 'New first' }, { id: 'new-b', text: 'New second' }] }} />);
    await act(async () => { resolveCopy(); });
    expect(screen.getByRole('textbox')).toHaveValue('New first');
    expect(screen.getByText('Post 1 of 2')).toBeVisible();
  });

  it('does not open a composer after the thread editor unmounts during copying', async () => {
    let resolveCopy!: () => void;
    vi.mocked(copyPlainText).mockImplementationOnce(() => new Promise((resolve) => { resolveCopy = resolve; }));
    const open = vi.spyOn(window, 'open').mockReturnValue(window);
    const view = render(<ThreadEditor spec={xSpec} thread={initial} onChange={vi.fn()} linkPreviews={new Map()} showLinkPreviews />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy & open post 1' }));
    view.unmount();
    await act(async () => { resolveCopy(); });
    expect(open).not.toHaveBeenCalled();
  });
});
