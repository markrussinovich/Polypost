import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderForPlatform } from '../lib/platforms';
import { instagramSpec } from '../lib/platforms/instagram';
import { xSpec } from '../lib/platforms/x';
import type { EditorNode } from '../lib/exportText';
import type { PlatformSpec } from '../lib/platforms/types';
import { PlatformCard } from './PlatformCard';

vi.mock('../lib/clipboard', () => ({ copyPlainText: vi.fn().mockResolvedValue(undefined) }));
import { copyPlainText } from '../lib/clipboard';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const text: EditorNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Launch day' }] }] };
const empty: EditorNode = { type: 'doc', content: [] };

function renderCard(spec: PlatformSpec, doc: EditorNode) {
  return render(
    <PlatformCard
      spec={spec}
      render={renderForPlatform(doc, spec)}
      document={doc}
      isForked={false}
      isAiAdapted={false}
      attachments={[]}
      isGenerating={false}
      aiReady={false}
      isEditing={false}
      masterVersion={0}
      onStartEditing={() => {}}
      onStopEditing={() => {}}
      onPaneChange={() => {}}
      onResync={() => {}}
      onFit={() => {}}
    />,
  );
}

describe('PlatformCard copy actions', () => {
  it('disables copy when there is no text', () => {
    renderCard(xSpec, empty);
    expect(screen.getByRole('button', { name: /^Copy$/ })).toBeDisabled();
  });

  it('copies the platform text when Copy is clicked', () => {
    renderCard(xSpec, text);
    fireEvent.click(screen.getByRole('button', { name: /^Copy$/ }));
    expect(copyPlainText).toHaveBeenCalledWith('Launch day');
  });

  it('shows a Copy & open button only when the platform has a composer', () => {
    renderCard(xSpec, text);
    expect(screen.getByRole('button', { name: /Copy & open/ })).toBeInTheDocument();

    cleanup();
    // Instagram is copy-only.
    renderCard(instagramSpec, text);
    expect(screen.queryByRole('button', { name: /Copy & open/ })).toBeNull();
  });
});
