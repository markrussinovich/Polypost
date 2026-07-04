import { describe, expect, it, vi } from 'vitest';

import type { EditorNode } from '../exportText';
import { PLATFORMS_BY_ID, renderForPlatform } from '../platforms';
import { defaultLlmConfig } from './config';
import { docToMarkdown } from './docText';

// Echo the post the app sends to the model (everything after the fit prompt's
// "Post:\n" marker), so the test exercises the real round-trip: docToMarkdown ->
// prompt -> model reply -> markdownToTipTap -> renderForPlatform. This mirrors the
// browser validation: a cooperating model returns the Markdown it was given.
vi.mock('./llmClient', () => ({
  generateText: vi.fn(async ({ prompt }: { prompt: string }) => {
    const marker = prompt.lastIndexOf('Post:\n');
    return marker === -1 ? prompt : prompt.slice(marker + 'Post:\n'.length).trim();
  }),
}));

import { generateFit } from './fit';

const config = { ...defaultLlmConfig(), enabled: true, apiKey: 'k' };

// Count Mathematical Alphanumeric Symbols (the Unicode block the app uses to
// render bold/italic on platforms that support styled text).
function styledCount(text: string): number {
  return Array.from(text).filter((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return cp >= 0x1d400 && cp <= 0x1d7ff;
  }).length;
}

const boldDoc: EditorNode = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Big news today everyone', marks: [{ type: 'bold' }] }],
    },
  ],
};

describe('AI formatting preservation (end-to-end)', () => {
  it('keeps bold on a styling-capable platform when the model echoes the Markdown', async () => {
    const masterMarkdown = docToMarkdown(boldDoc);
    expect(masterMarkdown).toBe('**Big news today everyone**');

    const linkedin = PLATFORMS_BY_ID.linkedin;
    const result = await generateFit({ config, spec: linkedin, masterText: masterMarkdown });

    // The fitted doc carries the bold mark...
    const hasBoldMark = JSON.stringify(result.doc).includes('"bold"');
    expect(hasBoldMark).toBe(true);
    // ...and it renders as styled Unicode bold on LinkedIn.
    expect(styledCount(renderForPlatform(result.doc, linkedin).text)).toBeGreaterThan(0);
  });

  it('drops styling on a plain-text platform (X renders no styled glyphs)', async () => {
    // On X the app sends plain text (no Markdown), so nothing to preserve.
    const result = await generateFit({ config, spec: PLATFORMS_BY_ID.x, masterText: 'Big news today everyone' });

    expect(styledCount(renderForPlatform(result.doc, PLATFORMS_BY_ID.x).text)).toBe(0);
  });
});
