import { describe, expect, it } from 'vitest';

import {
  buildSourcesBlock,
  makeTextSource,
  withPastedText,
  MAX_SOURCE_CHARS,
  MAX_TOTAL_SOURCE_CHARS,
  type Source,
} from './sources';

function readySource(text: string, title = 'S'): Source {
  return { id: title, kind: 'text', title, text, charCount: text.length, status: 'ready' };
}

describe('sources', () => {
  it('makeTextSource trims and counts', () => {
    const source = makeTextSource('  Title  ', '  hello  ');
    expect(source.title).toBe('Title');
    expect(source.text).toBe('hello');
    expect(source.charCount).toBe(5);
    expect(source.status).toBe('ready');
  });

  it('withPastedText flips a needs-text source to ready', () => {
    const pending: Source = { id: '1', kind: 'url', title: 'x', text: '', charCount: 0, status: 'needs-text', url: 'https://x.test' };
    const filled = withPastedText(pending, '  body  ');
    expect(filled.status).toBe('ready');
    expect(filled.text).toBe('body');

    expect(withPastedText(pending, '   ').status).toBe('needs-text');
  });

  it('buildSourcesBlock skips empty and needs-text sources', () => {
    expect(buildSourcesBlock([])).toBeNull();
    expect(buildSourcesBlock([{ id: '1', kind: 'url', title: 'x', text: '', charCount: 0, status: 'needs-text' }])).toBeNull();

    const block = buildSourcesBlock([readySource('alpha', 'A')]);
    expect(block).toContain('--- A ---');
    expect(block).toContain('alpha');
  });

  it('caps per-source and total length', () => {
    const big = 'a'.repeat(MAX_SOURCE_CHARS + 5000);
    const block = buildSourcesBlock([readySource(big, 'A'), readySource(big, 'B')]) ?? '';
    expect(block).toContain('…[truncated]');
    // Total budget cap keeps the whole block bounded.
    expect(block.length).toBeLessThanOrEqual(MAX_TOTAL_SOURCE_CHARS + 200);
  });
});
