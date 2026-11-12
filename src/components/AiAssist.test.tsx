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
  render(<AiAssist ready busy={busy} error={null} onSubmit={onSubmit} onCancel={vi.fn()} onOpenSettings={vi.fn()}
    hasDraft={false} stylePrompt="" sources={[]} onAddSource={vi.fn()} onUpdateSource={vi.fn()} onRemoveSource={vi.fn()} />);
  return { onSubmit, input: screen.getByLabelText('AI instruction') };
}

describe('AI authoring', () => {
  it('uses an animated icon with a screen-reader-only generating status', () => {
    setup(true);
    const status = screen.getByRole('status');
    expect(status).toHaveClass('sr-only');
    expect(status).toHaveTextContent('Generating draft');
    expect(status.closest('.ai-assist')).toHaveClass('is-busy');
    expect(status.closest('.ai-assist')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Working...')).toBeNull();
  });
  it('keeps an idle prompt until the user clicks Generate', async () => {
    const { onSubmit, input } = setup();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Write a launch post' } });
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue('Write a launch post');
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Write a launch post');
  });

  it('does not submit edited or recalled prompts on a timer', async () => {
    const { onSubmit, input } = setup();
    fireEvent.change(input, { target: { value: 'First' } });
    await act(async () => { vi.advanceTimersByTime(4000); });
    fireEvent.change(input, { target: { value: 'Updated prompt' } });
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Updated prompt');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveValue('Updated prompt');
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('Shift+Enter does not submit, while Enter submits once', async () => {
    const { onSubmit, input } = setup();
    fireEvent.change(input, { target: { value: 'Write now' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Write now');
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
