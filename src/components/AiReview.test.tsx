import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiProposal } from '../lib/ai/review';
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
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(onRegenerate).toHaveBeenCalledOnce();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept changes' })); });
    expect(onAccept).toHaveBeenCalledOnce();
  });
});
