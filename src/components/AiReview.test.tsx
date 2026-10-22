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

describe('inline AI review', () => {
  it('shows a separate accept and reject control on every change without instructions or final approval', () => {
    render(<AiReview proposal={proposal} busy={false} {...callbacks()} />);
    expect(screen.getAllByRole('button', { name: /^Accept change / })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Reject change / })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Accept changes' })).toBeNull();
    expect(screen.queryByText(/Tracked changes:/)).toBeNull();
    expect(screen.queryByText(/Your current text/)).toBeNull();
  });

  it('applies mixed choices automatically after the last decision', async () => {
    const handlers = callbacks();
    render(<AiReview proposal={proposal} busy={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject change 1' }));
    expect(handlers.onAccept).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept change 1' })); });
    expect(docToMarkdown(handlers.onAccept.mock.calls[0][0])).toBe('My old post!');
  });

  it('accepts all pending changes but preserves prior rejections', async () => {
    const handlers = callbacks();
    render(<AiReview proposal={proposal} busy={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject change 1' }));
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
    expect(screen.getByRole('button', { name: 'Accept change 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject All' })).toBeDisabled();
  });
});
