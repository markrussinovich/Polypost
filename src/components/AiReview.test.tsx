import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiProposal } from '../lib/ai/review';
import { docToMarkdown } from '../lib/ai/docText';
import type { EditorNode } from '../lib/exportText';
import { AiReview } from './AiReview';

afterEach(cleanup);

const before = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original words' }] }] };
const proposal: AiProposal = {
  before, master: before,
  after: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Suggestion' }] }] },
  platform: 'x', truncated: true,
};

describe('AI review', () => {
  it('exposes mechanical truncation and waits for acceptance before invoking the apply callback', async () => {
    const onAccept = vi.fn(async () => {});
    const onReject = vi.fn();
    const onRegenerate = vi.fn();
    render(<AiReview proposal={proposal} busy={false} onAccept={onAccept} onReject={onReject} onRegenerate={onRegenerate} />);
    expect(screen.getByRole('alert')).toHaveTextContent('mechanically cut');
    expect(screen.getByText('Original words')).toBeInTheDocument();
    expect(screen.getByText('Suggestion')).toBeInTheDocument();
    expect(screen.getByLabelText('Removed text').tagName).toBe('DEL');
    expect(screen.getByLabelText('Added text').tagName).toBe('INS');
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(onRegenerate).toHaveBeenCalledOnce();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept changes' })); });
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('renders the initial draft without added or removed markup', () => {
    render(<AiReview
      proposal={{ ...proposal, before: { type: 'doc', content: [{ type: 'paragraph' }] }, truncated: false }}
      busy={false} onAccept={vi.fn()} onReject={vi.fn()} onRegenerate={vi.fn()}
    />);
    const changes = screen.getByRole('region', { name: 'Tracked changes for X' });
    expect(changes).toHaveTextContent('Suggestion');
    expect(changes.querySelector('ins, del')).toBeNull();
    expect(screen.getByText('Initial draft: all text is unmarked.')).toBeInTheDocument();
  });

  it('shows unchanged passages once, with changes inline', () => {
    const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
    render(<AiReview
      proposal={{ ...proposal, before: doc('My old post'), after: doc('My new post'), truncated: false }}
      busy={false} onAccept={vi.fn()} onReject={vi.fn()} onRegenerate={vi.fn()}
    />);
    const changes = screen.getByRole('region', { name: 'Tracked changes for X' });
    expect(within(changes).getByLabelText('Removed text')).toHaveTextContent('old');
    expect(within(changes).getByLabelText('Added text')).toHaveTextContent('new');
    expect(changes.querySelectorAll('span:not([role])')).toHaveLength(2);
    expect(screen.queryByText('Before')).toBeNull();
    expect(screen.queryByText('Suggested')).toBeNull();
  });

  it('accepts and rejects individual replacements, then applies only the chosen edits', async () => {
    const doc = (text: string): EditorNode => ({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const onAccept = vi.fn(async (_document?: EditorNode) => {});
    render(<AiReview
      proposal={{ ...proposal, before: doc('My old post.'), after: doc('My new post!'), truncated: false }}
      busy={false} onAccept={onAccept} onReject={vi.fn()} onRegenerate={vi.fn()}
    />);
    expect(screen.getByText('Change 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next change' }));
    expect(screen.getByText('Change 2 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject change' }));
    expect(screen.queryByText('new')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Accept change' }));
    expect(screen.getByText('All changes reviewed')).toBeInTheDocument();
    expect(screen.queryByLabelText('Added text')).toBeNull();
    expect(screen.queryByLabelText('Removed text')).toBeNull();
    expect(onAccept).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept changes' })); });
    expect(docToMarkdown(onAccept.mock.calls[0][0])).toBe('My old post!');
  });

  it('bulk decisions resolve remaining changes without overwriting previously reviewed choices', async () => {
    const doc = (text: string): EditorNode => ({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const onAccept = vi.fn(async (_document?: EditorNode) => {});
    const props = {
      proposal: { ...proposal, before: doc('My old post.'), after: doc('My new post!'), truncated: false },
      busy: false, onAccept, onReject: vi.fn(), onRegenerate: vi.fn(),
    };
    const { unmount } = render(<AiReview {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept All' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept changes' })); });
    expect(docToMarkdown(onAccept.mock.calls[0][0])).toBe('My old post!');
    unmount();
    render(<AiReview {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject All' }));
    expect(screen.getByRole('region', { name: 'Tracked changes for X' })).toHaveTextContent('My old post.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept changes' })); });
    expect(docToMarkdown(onAccept.mock.calls[1][0])).toBe('My old post.');
  });

  it('clears review decisions when a regenerated suggestion arrives', () => {
    const doc = (text: string): EditorNode => ({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const props = {
      proposal: { ...proposal, before: doc('Old'), after: doc('New'), truncated: false },
      busy: false, onAccept: vi.fn(), onReject: vi.fn(), onRegenerate: vi.fn(),
    };
    const { rerender } = render(<AiReview {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject All' }));
    rerender(<AiReview {...props} proposal={{ ...props.proposal, after: doc('Another suggestion') }} />);
    expect(screen.getByLabelText('Added text')).toHaveTextContent('Another suggestion');
    expect(screen.getByRole('button', { name: 'Accept change' })).toBeEnabled();
  });

  it('preserves formatting and mention tokens when applying mixed review choices', async () => {
    const doc = (text: string): EditorNode => ({
      type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'Hello', marks: [{ type: 'bold' }] },
        { type: 'text', text: ` @[Jane Doe] ${text}` },
      ] }],
    });
    const onAccept = vi.fn(async (_document?: EditorNode) => {});
    render(<AiReview
      proposal={{ ...proposal, before: doc('old news.'), after: doc('new news!'), truncated: false }}
      busy={false} onAccept={onAccept} onReject={vi.fn()} onRegenerate={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept All' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept changes' })); });
    expect(docToMarkdown(onAccept.mock.calls[0][0])).toBe('**Hello** @[Jane Doe] old news!');
  });
});
