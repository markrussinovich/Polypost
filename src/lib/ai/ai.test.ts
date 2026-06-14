import { beforeEach, describe, expect, it } from 'vitest';

import type { EditorNode } from '../exportText';
import { xSpec } from '../platforms/x';
import { selectAutofit } from './autofit';
import { defaultLlmConfig, isLlmReady, loadLlmConfig, saveLlmConfig } from './config';
import { docToPlainText, plainTextToDoc } from './docText';
import { buildAuthorRequest, buildFitRequest } from './prompts';

function longDoc(chars: number): EditorNode {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(chars) }] }] };
}

describe('plainTextToDoc / docToPlainText', () => {
  it('round-trips multi-paragraph text', () => {
    const text = 'First line\nsecond line\n\nNew paragraph';
    expect(docToPlainText(plainTextToDoc(text))).toBe(text);
  });

  it('maps single newlines to hard breaks and a blank line to an empty paragraph', () => {
    const doc = plainTextToDoc('a\nb\n\nc');
    // para(a<br>b), empty paragraph (the blank line), para(c).
    expect(doc.content).toHaveLength(3);
    expect(doc.content?.[0].content?.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text']);
    expect(doc.content?.[1]).toEqual({ type: 'paragraph' });
    expect(doc.content?.[2].content?.map((n) => n.type)).toEqual(['text']);
  });
});

describe('prompt builders', () => {
  it('includes the platform label and character limit in a fit request', () => {
    const request = buildFitRequest(xSpec, 'Hello world');
    expect(request.prompt).toContain('X');
    expect(request.prompt).toContain('280');
    expect(request.prompt).toContain('Hello world');
    // X disallows styled Unicode — the model is told to use plain text.
    expect(request.prompt.toLowerCase()).toContain('plain text');
  });

  it('uses the current draft as context when revising', () => {
    const request = buildAuthorRequest('make it punchier', 'My draft');
    expect(request.prompt).toContain('My draft');
    expect(request.prompt).toContain('make it punchier');
  });
});

describe('selectAutofit', () => {
  it('fits enabled, over-limit, non-forked platforms', () => {
    const selection = selectAutofit({
      master: longDoc(400), // over X (280) and Bluesky (300), under nothing else
      enabledPlatforms: ['x', 'bluesky'],
      userForkedIds: new Set(),
      aiVersionIds: new Set(),
    });

    expect(selection.toFit.sort()).toEqual(['bluesky', 'x']);
  });

  it('never fits a platform the user has forked', () => {
    const selection = selectAutofit({
      master: longDoc(400),
      enabledPlatforms: ['x', 'bluesky'],
      userForkedIds: new Set(['x']),
      aiVersionIds: new Set(),
    });

    expect(selection.toFit).toEqual(['bluesky']);
  });

  it('clears AI versions that now fit or are no longer eligible', () => {
    const selection = selectAutofit({
      master: longDoc(50), // under every limit now
      enabledPlatforms: ['x', 'bluesky'],
      userForkedIds: new Set(),
      aiVersionIds: new Set(['x']),
    });

    expect(selection.toFit).toEqual([]);
    expect(selection.toClear).toEqual(['x']);
  });
});

describe('llm config', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('is not ready until enabled with endpoint, model, and key', () => {
    expect(isLlmReady(defaultLlmConfig())).toBe(false);
    expect(isLlmReady({ ...defaultLlmConfig(), enabled: true })).toBe(false);
    expect(isLlmReady({ ...defaultLlmConfig(), enabled: true, apiKey: 'sk-123' })).toBe(true);
  });

  it('round-trips through localStorage', () => {
    const config = { ...defaultLlmConfig(), enabled: true, apiKey: 'sk-xyz', model: 'claude-opus-4-8' };
    saveLlmConfig(config);
    expect(loadLlmConfig()).toEqual(config);
  });

  it('falls back to defaults on missing or corrupt storage', () => {
    expect(loadLlmConfig()).toEqual(defaultLlmConfig());
    window.localStorage.setItem('omnipost:llm-config-v1', '{ broken');
    expect(loadLlmConfig()).toEqual(defaultLlmConfig());
  });
});
