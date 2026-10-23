import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyPlainText } from '../lib/clipboard';
import { xSpec } from '../lib/platforms/x';
import type { PostThread } from '../lib/postThreads';
import { ThreadEditor } from './ThreadEditor';

vi.mock('../lib/clipboard', () => ({ copyPlainText: vi.fn(async () => {}) }));
afterEach(() => { cleanup(); vi.mocked(copyPlainText).mockReset(); });

const initial: PostThread = { numbered: true, posts: [{ id: 'a', text: 'First post' }, { id: 'b', text: 'Second post' }] };

function setup(thread = initial) {
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = useState(thread);
    return <ThreadEditor spec={xSpec} thread={value} onChange={(next) => { changed(next); setValue(next); }} linkPreviews={new Map()} showLinkPreviews />;
  }
  render(<Harness />);
  return changed;
}

describe('thread editor', () => {
  it('edits each post, updates its count and copies precisely the numbered text', async () => {
    setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'X post 1 text' }), { target: { value: 'Edited' } });
    const post = screen.getByRole('listitem', { name: 'X post 1' });
    expect(post.querySelector('.character-meter strong')).toHaveTextContent('11');
    await act(async () => { fireEvent.click(within(post).getByRole('button', { name: 'Copy post 1' })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('Edited\n\n1/2');
    expect(within(post).getByText('Copied!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Number posts' }));
    expect(post.querySelector('.character-meter strong')).toHaveTextContent('6');
    await act(async () => { fireEvent.click(within(post).getByRole('button', { name: 'Copy post 1' })); });
    expect(copyPlainText).toHaveBeenLastCalledWith('Edited');
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Number posts' }));
    expect(screen.queryByRole('status')).toBeNull();
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
