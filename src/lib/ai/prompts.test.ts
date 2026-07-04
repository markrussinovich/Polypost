import { describe, expect, it } from 'vitest';

import { xSpec } from '../platforms/x';
import { buildFitRequest } from './prompts';

describe('buildFitRequest URL preservation', () => {
  it('instructs the model to keep the last URL when the post contains links', () => {
    const text = 'See https://a.test/first and then https://b.test/last for details.';
    const { system, prompt } = buildFitRequest(xSpec, text);

    expect(prompt).toContain('https://b.test/last');
    expect(prompt).toContain('keep the last URL');
    expect(prompt).not.toContain('keep the last URL (https://a.test/first)');
    expect(system).toContain('keep the last URL intact');
  });

  it('omits the URL note when the post has no links', () => {
    const { prompt } = buildFitRequest(xSpec, 'A plain post with no links at all.');

    expect(prompt).not.toContain('keep the last URL (');
  });
});
