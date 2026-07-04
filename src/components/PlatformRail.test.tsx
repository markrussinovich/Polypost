import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PLATFORMS, renderForPlatform } from '../lib/platforms';
import { blueskySpec } from '../lib/platforms/bluesky';
import { linkedinSpec } from '../lib/platforms/linkedin';
import type { EditorNode } from '../lib/exportText';
import type { PlatformId, PlatformRender } from '../lib/platforms/types';
import { PlatformRail } from './PlatformRail';
import { PlatformToggleChips } from './PlatformToggleChips';

afterEach(cleanup);

const doc: EditorNode = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
};

describe('PlatformRail', () => {
  function renderRail(specs: typeof PLATFORMS) {
    const renders = new Map<PlatformId, PlatformRender>(specs.map((spec) => [spec.id, renderForPlatform(doc, spec)]));
    const documents = new Map<PlatformId, EditorNode>(specs.map((spec) => [spec.id, doc]));

    return render(
      <PlatformRail
        specs={specs}
        renders={renders}
        documents={documents}
        forkedIds={new Set()}
        aiAdaptedIds={new Set()}
        imageAttachment={null}
        linkPreviews={new Map()}
        generatingIds={new Set()}
        aiReady={false}
        aiError={null}
        editingId={null}
        masterVersion={0}
        onStartEditing={() => {}}
        onStopEditing={() => {}}
        onPaneChange={() => {}}
        onResync={() => {}}
        onFit={() => {}}
      />,
    );
  }

  it('renders one card per enabled platform with its character count', () => {
    renderRail([linkedinSpec, blueskySpec]);

    expect(screen.getByLabelText('LinkedIn preview')).toBeInTheDocument();
    expect(screen.getByLabelText('Bluesky preview')).toBeInTheDocument();
    // The shared post text shows in each card.
    expect(screen.getAllByText('Hello world')).toHaveLength(2);
  });

  it('shows an empty hint when no platforms are enabled', () => {
    renderRail([]);
    expect(screen.getByText(/Enable a platform/)).toBeInTheDocument();
  });
});

describe('PlatformToggleChips', () => {
  it('marks enabled chips pressed and toggles on click', () => {
    const onToggle = vi.fn();
    render(<PlatformToggleChips specs={PLATFORMS} enabled={['linkedin']} onToggle={onToggle} />);

    const linkedinChip = screen.getByRole('button', { name: /LinkedIn/ });
    const xChip = screen.getByRole('button', { name: /^X/ });

    expect(linkedinChip).toHaveAttribute('aria-pressed', 'true');
    expect(xChip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(xChip);
    expect(onToggle).toHaveBeenCalledWith('x');
  });
});
