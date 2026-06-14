import { describe, expect, it } from 'vitest';

import { formatLinksForText, linkUrls, makeLinkAttachment, type Attachment } from './media';

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

  it('extracts only link URLs in order', () => {
    const attachments: Attachment[] = [
      { id: '1', kind: 'image', name: 'a.png' },
      { id: '2', kind: 'link', name: 'one', url: 'https://one.test' },
      { id: '3', kind: 'link', name: 'two', url: 'https://two.test' },
    ];

    expect(linkUrls(attachments)).toEqual(['https://one.test', 'https://two.test']);
  });

  it('formats links as a trailing block, empty when none', () => {
    expect(formatLinksForText([])).toBe('');
    expect(formatLinksForText(['https://one.test', 'https://two.test'])).toBe('\n\nhttps://one.test\nhttps://two.test');
  });
});
