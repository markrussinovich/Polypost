import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiProposal } from '../lib/ai/review';
import { docToMarkdown } from '../lib/ai/docText';
import type { EditorNode } from '../lib/exportText';
import { AiReview } from './AiReview';

afterEach(cleanup);

const doc = (text: string): EditorNode => ({
  type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const proposal: AiProposal = {
  before: doc('My old post.'), master: doc('My old post.'), after: doc('My new post!'),
  platform: 'x', truncated: false,
};
const callbacks = () => ({
  onAccept: vi.fn(async (_document?: EditorNode) => {}),
  onReject: vi.fn(),
});

function changeAction(number: number, action: 'Accept' | 'Reject', rightClick = false) {
  const change = screen.getByRole('group', { name: `Change ${number}` });
  if (rightClick) fireEvent.contextMenu(change, { clientX: 100, clientY: 120 });
  else fireEvent.click(change, { clientX: 100, clientY: 120 });
  fireEvent.click(screen.getByRole('menuitem', { name: `${action} change` }));
}

describe('main draft AI review', () => {
  it('hides per-change actions until a change is clicked', () => {
    render(<AiReview proposal={proposal} busy={false} {...callbacks()} />);
    expect(screen.getAllByRole('group', { name: /^Change / })).toHaveLength(2);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Accept change / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accept changes' })).toBeNull();
    expect(screen.queryByText(/Tracked changes:/)).toBeNull();
    expect(screen.queryByText(/Your current text/)).toBeNull();
  });

  it('applies mixed choices automatically after the last decision', async () => {
    const handlers = callbacks();
    render(<AiReview proposal={proposal} busy={false} {...handlers} />);
    changeAction(1, 'Reject');
    expect(handlers.onAccept).not.toHaveBeenCalled();
    fireEvent.contextMenu(screen.getByRole('group', { name: 'Change 1' }));
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Accept change' })); });
    expect(docToMarkdown(handlers.onAccept.mock.calls[0][0])).toBe('My old post!');
  });

  it('previews applied changes without resolving them and restores review markup', () => {
    const handlers = callbacks();
    render(<AiReview proposal={proposal} busy={false} {...handlers} />);
    const toggle = screen.getByRole('checkbox', { name: 'View changes applied' });
    const changes = screen.getByRole('region', { name: 'Tracked changes for X' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(changes).toHaveTextContent('My new post!');
    expect(changes.querySelector('ins, del')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('2 changes');
    expect(handlers.onAccept).not.toHaveBeenCalled();
    expect(handlers.onReject).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(changes.querySelector('ins')).not.toBeNull();
    expect(changes.querySelector('del')).not.toBeNull();
    expect(screen.getAllByRole('group', { name: /^Change / })).toHaveLength(2);
  });

  it('preserves decisions and in-place edits when switching preview modes', async () => {
    const handlers = callbacks();
    render(<AiReview proposal={proposal} busy={false} {...handlers} />);
    changeAction(1, 'Reject');
    const editable = screen.getAllByRole('textbox')[0];
    editable.textContent = 'Your ';
    fireEvent.input(editable);
    const toggle = screen.getByRole('checkbox', { name: 'View changes applied' });
    fireEvent.click(toggle);
    expect(screen.getByRole('region', { name: 'Tracked changes for X' })).toHaveTextContent('Your old post!');
    fireEvent.click(toggle);
    expect(screen.getAllByRole('group', { name: /^Change / })).toHaveLength(1);
    fireEvent.click(toggle);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept All' })); });
    expect(docToMarkdown(handlers.onAccept.mock.calls[0][0])).toBe('Your old post!');
  });

  it('accepts all pending changes but preserves prior rejections', async () => {
    const handlers = callbacks();
    render(<AiReview proposal={proposal} busy={false} {...handlers} />);
    changeAction(1, 'Reject');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept All' })); });
    expect(docToMarkdown(handlers.onAccept.mock.calls[0][0])).toBe('My old post!');
  });

  it('rejects all without applying a changed draft', async () => {
    const handlers = callbacks();
    render(<AiReview proposal={proposal} busy={false} {...handlers} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reject All' })); });
    expect(handlers.onReject).toHaveBeenCalledOnce();
    expect(handlers.onAccept).not.toHaveBeenCalled();
  });

  it('starts the initial draft unmarked and applies it automatically', async () => {
    const handlers = callbacks();
    render(<AiReview proposal={{ ...proposal, before: doc('') }} busy={false} {...handlers} />);
    const changes = screen.getByRole('region', { name: 'Tracked changes for X' });
    expect(changes.querySelector('ins, del')).toBeNull();
    expect(changes).toHaveTextContent('My new post!');
    await act(async () => {});
    expect(handlers.onAccept).toHaveBeenCalledWith(proposal.after);
  });

  it('allows editing a suggestion directly before accepting a change', async () => {
    const handlers = callbacks();
    render(<AiReview proposal={proposal} busy={false} {...handlers} />);
    const addition = screen.getAllByLabelText('Added text', { selector: 'ins' })[0];
    const editable = addition.querySelector('[contenteditable]')!;
    editable.textContent = 'better';
    fireEvent.input(editable);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept All' })); });
    expect(docToMarkdown(handlers.onAccept.mock.calls[0][0])).toBe('My better post!');
  });

  it('warns when AI was mechanically shortened', () => {
    render(<AiReview proposal={{ ...proposal, truncated: true }} busy={false} {...callbacks()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('cut to fit');
  });

  it('keeps edits to unchanged text when rejecting AI changes', async () => {
    const handlers = callbacks();
    render(<AiReview proposal={proposal} busy={false} {...handlers} />);
    const editable = screen.getAllByRole('textbox')[0];
    editable.textContent = 'Your ';
    fireEvent.input(editable);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reject All' })); });
    expect(docToMarkdown(handlers.onAccept.mock.calls[0][0])).toBe('Your old post.');
  });

  it('disables decisions while generation is running', () => {
    render(<AiReview proposal={proposal} busy {...callbacks()} />);
    fireEvent.click(screen.getByRole('group', { name: 'Change 1' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reject All' })).toBeDisabled();
  });

  it('opens from either mouse button and dismisses on Escape or an outside click', () => {
    render(<AiReview proposal={proposal} busy={false} {...callbacks()} />);
    const change = screen.getByRole('group', { name: 'Change 1' });
    fireEvent.click(change, { clientX: 100, clientY: 120 });
    expect(screen.getByRole('menu')).toHaveStyle({ left: '100px', top: '120px' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.contextMenu(change, { clientX: 180, clientY: 200 });
    expect(screen.getByRole('menuitem', { name: 'Accept change' })).toHaveFocus();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('supports keyboard context menus and arrow navigation', () => {
    render(<AiReview proposal={proposal} busy={false} {...callbacks()} />);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Change 1' }), { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menuitem', { name: 'Accept change' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Reject change' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Accept change' })).toHaveFocus();
  });
});
