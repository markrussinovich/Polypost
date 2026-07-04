import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeTextSource, type Source } from '../lib/ai/sources';
import { SourcesPanel } from './SourcesPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function noop() {}

describe('SourcesPanel', () => {
  it('opens a preview of the source text on double-click', () => {
    const source: Source = makeTextSource('Launch notes', 'Ship the multi-platform editor on Tuesday.');

    render(
      <SourcesPanel sources={[source]} onAddSource={noop} onUpdateSource={noop} onRemoveSource={noop} />,
    );

    // No preview until the row is double-clicked.
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.doubleClick(screen.getByText('Launch notes'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Ship the multi-platform editor on Tuesday.');
  });

  it('exposes a link to the original page for URL sources', () => {
    const source: Source = {
      id: 'u1',
      kind: 'url',
      title: 'Example article',
      text: 'Body text',
      charCount: 9,
      status: 'ready',
      url: 'https://example.test/post',
    };

    render(
      <SourcesPanel sources={[source]} onAddSource={noop} onUpdateSource={noop} onRemoveSource={noop} />,
    );

    fireEvent.doubleClick(screen.getByText('Example article'));

    const link = screen.getByRole('link', { name: /open original/i });
    expect(link).toHaveAttribute('href', 'https://example.test/post');
  });
});
