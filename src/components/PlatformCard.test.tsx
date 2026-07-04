import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderForPlatform } from '../lib/platforms';
import { blueskySpec } from '../lib/platforms/bluesky';
import { instagramSpec } from '../lib/platforms/instagram';
import { linkedinSpec } from '../lib/platforms/linkedin';
import { mastodonSpec } from '../lib/platforms/mastodon';
import { threadsSpec } from '../lib/platforms/threads';
import { xSpec } from '../lib/platforms/x';
import type { EditorNode } from '../lib/exportText';
import { copyImageToClipboard, type Attachment, type LinkPreview } from '../lib/media';
import type { PlatformSpec } from '../lib/platforms/types';
import { PlatformCard } from './PlatformCard';

vi.mock('../lib/clipboard', () => ({ copyPlainText: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../lib/media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/media')>()),
  copyImageToClipboard: vi.fn().mockResolvedValue(undefined),
}));
import { copyPlainText } from '../lib/clipboard';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const text: EditorNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Launch day' }] }] };
const empty: EditorNode = { type: 'doc', content: [] };

function renderCard(spec: PlatformSpec, doc: EditorNode, linkPreviews: ReadonlyMap<string, LinkPreview> = new Map(), imageAttachment: Attachment | null = null) {
  return render(
    <PlatformCard
      spec={spec}
      render={renderForPlatform(doc, spec)}
      document={doc}
      isForked={false}
      isAiAdapted={false}
      imageAttachment={imageAttachment}
      linkPreviews={linkPreviews}
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

  it('shows Copy image before Copy when an image is selected', () => {
    const image: Attachment = { id: 'img1', kind: 'image', name: 'photo.png', objectUrl: 'blob:photo', mime: 'image/png' };
    renderCard(xSpec, text, new Map(), image);

    const buttons = screen.getAllByRole('button', { name: /copy/i });

    expect(buttons[0]).toHaveTextContent('Copy image');
    expect(buttons[1]).toHaveTextContent('Copy');

    fireEvent.click(buttons[0]);
    expect(copyImageToClipboard).toHaveBeenCalledWith(image);
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

describe('PlatformCard link preview', () => {
  const url = 'https://example.test/post';
  const linkedText: EditorNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Launch day ${url}` }] }] };
  const previewsWith = (preview: LinkPreview): ReadonlyMap<string, LinkPreview> => new Map([[url, preview]]);

  it('renders the unfurl preview with the fetched title in the large layout', () => {
    const { container } = renderCard(xSpec, linkedText, previewsWith({ status: 'ready', title: 'Headline', imageUrl: 'https://cdn.test/og.jpg' }));

    const card = container.querySelector('.card-link-preview');
    expect(card).not.toBeNull();
    expect(card?.classList.contains('is-large')).toBe(true);
    expect(screen.getByText('Headline')).toBeInTheDocument();
    expect(screen.getByText('example.test')).toBeInTheDocument();
  });

  it('uses the compact thumbnail layout for Mastodon, with the description', () => {
    const { container } = renderCard(mastodonSpec, linkedText, previewsWith({ status: 'ready', title: 'Headline', description: 'A summary' }));

    expect(container.querySelector('.card-link-preview.is-thumbnail')).not.toBeNull();
    expect(screen.getByText('A summary')).toBeInTheDocument();
  });

  it('uses LinkedIn\'s compact thumbnail layout without the description', () => {
    const { container } = renderCard(linkedinSpec, linkedText, previewsWith({ status: 'ready', title: 'Headline', description: 'A summary', imageUrl: 'https://cdn.test/og.jpg' }));

    expect(container.querySelector('.card-link-preview.is-thumbnail.is-linkedin')).not.toBeNull();
    expect(screen.getByText('Headline')).toBeInTheDocument();
    expect(screen.queryByText('A summary')).toBeNull();
  });

  it('uses Threads\' large preview card without the description', () => {
    const { container } = renderCard(threadsSpec, linkedText, previewsWith({ status: 'ready', title: 'Headline', description: 'A summary', imageUrl: 'https://cdn.test/og.jpg' }));

    expect(container.querySelector('.card-link-preview.is-large.is-threads')).not.toBeNull();
    expect(screen.getByText('Headline')).toBeInTheDocument();
    expect(screen.queryByText('A summary')).toBeNull();
  });

  it('hides the description on platforms that do not show one', () => {
    renderCard(xSpec, linkedText, previewsWith({ status: 'ready', title: 'Headline', description: 'A summary' }));
    expect(screen.queryByText('A summary')).toBeNull();
  });

  it('does not show a preview for Instagram', () => {
    const { container } = renderCard(instagramSpec, linkedText, previewsWith({ status: 'ready', title: 'Headline' }));

    expect(container.querySelector('.card-link-preview')).toBeNull();
  });

  it('falls back to the description when the platform shows it', () => {
    renderCard(blueskySpec, linkedText, previewsWith({ status: 'ready', title: 'Headline', description: 'A summary' }));
    expect(screen.getByText('A summary')).toBeInTheDocument();
  });

  it('uses the last URL in the platform text for the preview', () => {
    const lastUrl = 'https://second.test/post';
    const doc: EditorNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `First https://first.test then ${lastUrl}` }] }] };

    renderCard(xSpec, doc, new Map([[lastUrl, { status: 'ready', title: 'Second link' }]]));

    expect(screen.getByText('Second link')).toBeInTheDocument();
    expect(screen.queryByText('first.test')).toBeNull();
  });

  it('shows a selected image instead of the URL preview', () => {
    const image: Attachment = { id: 'img1', kind: 'image', name: 'photo.png', objectUrl: 'blob:photo', mime: 'image/png' };
    const { container } = renderCard(xSpec, linkedText, previewsWith({ status: 'ready', title: 'Headline', imageUrl: 'https://cdn.test/og.jpg' }), image);

    expect(container.querySelector('.card-image-preview img')).toHaveAttribute('src', 'blob:photo');
    expect(container.querySelector('.card-link-preview')).toBeNull();
    expect(screen.queryByText('Headline')).toBeNull();
  });
});
