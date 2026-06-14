import { describe, expect, it } from 'vitest';

import { LINKEDIN_POST_CHARACTER_LIMIT, LINKEDIN_POST_WARNING_THRESHOLD } from './constants';
import {
  countLinkedInCharacters,
  exportLinkedInText,
  getLinkedInCharacterStatus,
  getLinkedInCharacterSummary,
  type EditorNode,
} from './exportLinkedInText';
import { styleText } from './unicodeStyles';

function doc(content: EditorNode[]): EditorNode {
  return { type: 'doc', content };
}

function paragraph(content: EditorNode[]): EditorNode {
  return { type: 'paragraph', content };
}

function text(value: string, marks: EditorNode['marks'] = []): EditorNode {
  return { type: 'text', text: value, marks };
}

describe('exportLinkedInText', () => {
  it('separates adjacent paragraphs with a single newline (blank lines come from empty paragraphs)', () => {
    expect(exportLinkedInText(doc([paragraph([text('First')]), paragraph([text('Second')])]))).toBe('First\nSecond');
    // An empty paragraph between them is the author-inserted blank line.
    expect(exportLinkedInText(doc([paragraph([text('First')]), paragraph([]), paragraph([text('Second')])]))).toBe('First\n\nSecond');
  });

  it('exports styled inline text as LinkedIn-friendly Unicode', () => {
    const document = doc([
      paragraph([
        text('Bold', [{ type: 'bold' }]),
        text(' and '),
        text('italic', [{ type: 'italic' }]),
        text(' plus '),
        text('both', [{ type: 'bold' }, { type: 'italic' }]),
        text('.'),
      ]),
    ]);

    expect(exportLinkedInText(document)).toBe(
      `${styleText('Bold', { bold: true })} and ${styleText('italic', { italic: true })} plus ${styleText('both', {
        bold: true,
        italic: true,
      })}.`,
    );
  });

  it('exports headings as bold LinkedIn-friendly Unicode', () => {
    const document = doc([{ type: 'heading', attrs: { level: 2 }, content: [text('Launch notes')] }]);

    expect(exportLinkedInText(document)).toBe(styleText('Launch notes', { bold: true }));
  });

  it('does not add a blank pasted line between a heading and following list', () => {
    const document = doc([
      { type: 'heading', attrs: { level: 3 }, content: [text('Features')] },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [paragraph([text('TipTap rich text editor')])] }],
      },
    ]);

    expect(exportLinkedInText(document)).toBe(`${styleText('Features', { bold: true })}\n• TipTap rich text editor`);
  });

  it('exports underline as combining underline text', () => {
    const document = doc([paragraph([text('Underlined', [{ type: 'underline' }])])]);

    expect(exportLinkedInText(document)).toBe('U̲n̲d̲e̲r̲l̲i̲n̲e̲d̲');
  });

  it('preserves hashtags and mentions inside styled text', () => {
    const document = doc([paragraph([text('Ship it #LinkedIn @Ada', [{ type: 'bold' }])])]);

    expect(exportLinkedInText(document)).toBe(`${styleText('Ship it ', { bold: true })}#LinkedIn @Ada`);
  });

  it('keeps mention tokens intact and unstyled inside styled text', () => {
    const document = doc([paragraph([text('Thanks @[Scott Hanselman] again', [{ type: 'bold' }])])]);

    expect(exportLinkedInText(document)).toBe(
      `${styleText('Thanks ', { bold: true })}@[Scott Hanselman]${styleText(' again', { bold: true })}`,
    );
  });

  it('preserves emoji in exported text and styled ranges', () => {
    const document = doc([paragraph([text('Launch 🚀', [{ type: 'bold' }, { type: 'underline' }]), text(' ✅')])]);

    expect(exportLinkedInText(document)).toBe(`${styleText('Launch 🚀', { bold: true, underline: true })} ✅`);
  });

  it('exports links as readable label plus URL and avoids duplicate bare URLs', () => {
    const document = doc([
      paragraph([
        text('Read the guide', [{ type: 'link', attrs: { href: 'https://example.com/guide' } }]),
        text(' or visit '),
        text('https://example.com', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
      ]),
    ]);

    expect(exportLinkedInText(document)).toBe('Read the guide (https://example.com/guide) or visit https://example.com');
  });

  it('exports flat bullet and ordered lists', () => {
    const document = doc([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph([text('First')])] },
          { type: 'listItem', content: [paragraph([text('Second')])] },
        ],
      },
      {
        type: 'orderedList',
        attrs: { start: 3 },
        content: [
          { type: 'listItem', content: [paragraph([text('Third')])] },
          { type: 'listItem', content: [paragraph([text('Fourth')])] },
        ],
      },
    ]);

    expect(exportLinkedInText(document)).toBe('• First\n• Second\n3. Third\n4. Fourth');
  });

  it('exports nested lists with plain text indentation', () => {
    const document = doc([
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              paragraph([text('Parent')]),
              {
                type: 'bulletList',
                content: [{ type: 'listItem', content: [paragraph([text('Child')])] }],
              },
            ],
          },
        ],
      },
    ]);

    expect(exportLinkedInText(document)).toBe('• Parent\n      • Child');
  });

  it('exports blockquotes as indented plain text and horizontal dividers without blank padding', () => {
    const document = doc([
      {
        type: 'blockquote',
        content: [paragraph([text('Quoted')]), paragraph([text('Follow-up')])],
      },
      { type: 'horizontalRule' },
      paragraph([text('After')]),
    ]);

    expect(exportLinkedInText(document)).toBe('      Quoted\n      Follow-up\n────────\nAfter');
  });

  it('strips unsupported leaf nodes and keeps supported text around them', () => {
    const document = doc([paragraph([text('Before '), { type: 'image', attrs: { src: 'x.png' } }, text('after')])]);

    expect(exportLinkedInText(document)).toBe('Before after');
  });

  it('counts the exported text, including Unicode output, by code point', () => {
    const exported = exportLinkedInText(doc([paragraph([text('A', [{ type: 'bold' }])])]));

    expect(exported).toBe(styleText('A', { bold: true }));
    expect(countLinkedInCharacters(exported)).toBe(1);
  });

  it('returns LinkedIn character count status from the exported string', () => {
    expect(getLinkedInCharacterStatus('a'.repeat(LINKEDIN_POST_WARNING_THRESHOLD - 1))).toBe('normal');
    expect(getLinkedInCharacterStatus('a'.repeat(LINKEDIN_POST_WARNING_THRESHOLD))).toBe('warning');
    expect(getLinkedInCharacterStatus('a'.repeat(LINKEDIN_POST_CHARACTER_LIMIT + 1))).toBe('over');
    expect(getLinkedInCharacterSummary('abc')).toMatchObject({ count: 3, remaining: LINKEDIN_POST_CHARACTER_LIMIT - 3 });
  });
});