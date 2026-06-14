import { describe, expect, it } from 'vitest';

import { looksLikeMarkdown, markdownToTipTap, plainTextToTipTap } from './markdownToTipTap';

describe('looksLikeMarkdown', () => {
  it('detects common markdown markers', () => {
    expect(looksLikeMarkdown('A **bold** move')).toBe(true);
    expect(looksLikeMarkdown('## Heading')).toBe(true);
    expect(looksLikeMarkdown('- item')).toBe(true);
    expect(looksLikeMarkdown('[link](example.com)')).toBe(true);
  });

  it('does not treat plain prose as markdown', () => {
    expect(looksLikeMarkdown('Just a normal LinkedIn post.')).toBe(false);
  });
});

describe('markdownToTipTap', () => {
  it('converts inline marks and links', () => {
    expect(markdownToTipTap('**Bold**, *italic*, __underline__, ~~strike~~, `code`, [site](example.com)')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ', ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
            { type: 'text', text: ', ' },
            { type: 'text', text: 'underline', marks: [{ type: 'underline' }] },
            { type: 'text', text: ', ' },
            { type: 'text', text: 'strike', marks: [{ type: 'strike' }] },
            { type: 'text', text: ', ' },
            { type: 'text', text: 'code', marks: [{ type: 'code' }] },
            { type: 'text', text: ', ' },
            { type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
          ],
        },
      ],
    });
  });

  it('converts lists, blockquotes, and horizontal rules', () => {
    expect(markdownToTipTap('- First\n- Second\n\n1. One\n2. Two\n\n> Quote\n---')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
          ],
        },
        { type: 'paragraph' },
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }] },
          ],
        },
        { type: 'paragraph' },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] }],
        },
        { type: 'horizontalRule' },
      ],
    });
  });

  it('converts markdown headings', () => {
    expect(markdownToTipTap('# Big idea\n\n### Detail')).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Big idea' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Detail' }] },
      ],
    });
  });

  it('converts fenced code blocks without keeping fence markers', () => {
    expect(markdownToTipTap('```bash\nnpm run build\nnpm test\n```')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'npm run build', marks: [{ type: 'code' }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'npm test', marks: [{ type: 'code' }] },
          ],
        },
      ],
    });
  });

  it('skips raw HTML image blocks from GitHub-style markdown', () => {
    expect(markdownToTipTap('# Title\n\n<p align="center">\n  <img src="docs/screenshot.png" alt="Screenshot">\n</p>\n\nAfter image')).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph' },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'After image' }] },
      ],
    });
  });
});

describe('plainTextToTipTap', () => {
  it('converts paragraphs and single line breaks without parsing markdown marks', () => {
    expect(plainTextToTipTap('First line\nSecond line\n\n**Plain**, not bold')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'First line' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Second line' },
          ],
        },
        { type: 'paragraph' },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '**Plain**, not bold' }],
        },
      ],
    });
  });
});
