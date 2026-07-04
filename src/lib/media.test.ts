import { afterEach, describe, expect, it } from 'vitest';

import {
  faviconUrl,
  hostnameOf,
  loadAttachments,
  makeLinkAttachment,
  restoreDraftAttachments,
  saveAttachments,
  serializeAttachmentsForDraft,
  type Attachment,
} from './media';

describe('media links', () => {
  it('normalizes a bare host into an https URL', () => {
    expect(makeLinkAttachment('example.com').url).toBe('https://example.com');
    expect(makeLinkAttachment('http://example.com').url).toBe('http://example.com');
    expect(makeLinkAttachment('https://example.com').url).toBe('https://example.com');
  });

  it('uses the URL as the name when no title is given', () => {
    expect(makeLinkAttachment('example.com').name).toBe('https://example.com');
    expect(makeLinkAttachment('example.com', 'My link').name).toBe('My link');
  });

  it('extracts a hostname without the www prefix', () => {
    expect(hostnameOf('https://www.example.com/article/slug')).toBe('example.com');
    expect(hostnameOf('https://news.example.co.uk')).toBe('news.example.co.uk');
    expect(hostnameOf('not a url')).toBe('not a url');
  });

  it('builds a DuckDuckGo favicon URL for a link domain', () => {
    expect(faviconUrl('https://www.example.com/x')).toBe('https://icons.duckduckgo.com/ip3/example.com.ico');
  });
});

describe('link preview persistence', () => {
  afterEach(() => window.localStorage.clear());

  it('round-trips a link preview through save/load', () => {
    const attachment: Attachment = {
      id: '1',
      kind: 'link',
      name: 'Example',
      url: 'https://example.test',
      preview: { status: 'ready', title: 'Title', description: 'Desc', imageUrl: 'https://cdn/og.jpg' },
    };

    saveAttachments([attachment]);
    const loaded = loadAttachments();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].preview).toEqual({ status: 'ready', title: 'Title', description: 'Desc', imageUrl: 'https://cdn/og.jpg' });
  });

  it('drops a stale "loading" preview on load so the fetch retries', () => {
    saveAttachments([{ id: '1', kind: 'link', name: 'x', url: 'https://example.test', preview: { status: 'loading' } }]);
    expect(loadAttachments()[0].preview).toBeUndefined();
  });

  it('keeps a manual preview on load', () => {
    saveAttachments([{ id: '1', kind: 'link', name: 'x', url: 'https://example.test', preview: { status: 'manual', title: 'Mine' } }]);
    expect(loadAttachments()[0].preview).toEqual({ status: 'manual', title: 'Mine' });
  });
});

describe('draft attachment persistence', () => {
  it('serializes and reconstructs one attachment for saved drafts', async () => {
    const image = new File(['pixels'], 'photo.png', { type: 'image/png' });
    const attachments: Attachment[] = [
      { id: 'img', kind: 'image', name: image.name, file: image, objectUrl: 'blob:test', mime: image.type, size: image.size },
      { id: 'link', kind: 'link', name: 'Example', url: 'https://example.test', preview: { status: 'ready', title: 'Title' } },
    ];

    const stored = await serializeAttachmentsForDraft(attachments);
    const restored = restoreDraftAttachments(stored);

    expect(stored).toHaveLength(1);
    expect(stored.find((attachment) => attachment.id === 'img')?.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(restored).toHaveLength(1);
    expect(restored.find((attachment) => attachment.id === 'img')?.file?.name).toBe('photo.png');

    restored.forEach((attachment) => {
      if (attachment.objectUrl) {
        URL.revokeObjectURL(attachment.objectUrl);
      }
    });
  });
});
