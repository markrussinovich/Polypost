import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAssist } from './AiAssist';

vi.mock('./SourcesPanel', () => ({ SourcesPanel: () => null }));

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(busy = false) {
  const onSubmit = vi.fn();
  render(<AiAssist ready busy={busy} error={null} onSubmit={onSubmit} onOpenSettings={vi.fn()}
    hasDraft={false} stylePrompt="" sources={[]} onAddSource={vi.fn()} onUpdateSource={vi.fn()} onRemoveSource={vi.fn()} />);
  return { onSubmit, input: screen.getByLabelText('AI instruction') };
}

describe('automatic AI authoring', () => {
  it('uses an animated icon with a screen-reader-only generating status', () => {
    setup(true);
    const status = screen.getByRole('status');
    expect(status).toHaveClass('sr-only');
    expect(status).toHaveTextContent('Generating draft');
    expect(status.closest('.ai-assist')).toHaveClass('is-busy');
    expect(status.closest('.ai-assist')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Working...')).toBeNull();
  });
  it('generates after three seconds of inactivity without a Generate button', async () => {
    const { onSubmit, input } = setup();
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
    fireEvent.change(input, { target: { value: 'Write a launch post' } });
    await act(async () => { vi.advanceTimersByTime(2999); });
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Write a launch post');
  });

  it('restarts the timer when the prompt changes and never generates an empty prompt', async () => {
    const { onSubmit, input } = setup();
    fireEvent.change(input, { target: { value: 'First' } });
    await act(async () => { vi.advanceTimersByTime(2000); });
    fireEvent.change(input, { target: { value: 'Updated prompt' } });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Updated prompt');
    fireEvent.change(input, { target: { value: '   ' } });
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('Enter submits immediately without a duplicate automatic request', async () => {
    const { onSubmit, input } = setup();
    fireEvent.change(input, { target: { value: 'Write now' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Write now');
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
