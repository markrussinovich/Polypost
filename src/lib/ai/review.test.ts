import { describe, expect, it } from 'vitest';

import { reviewChanges } from './review';

describe('tracked changes', () => {
  it('starts an initial draft entirely unchanged', () => {
    expect(reviewChanges('', 'My first draft.')).toEqual([{ kind: 'unchanged', text: 'My first draft.' }]);
    expect(reviewChanges(' \n', 'My first draft.')).toEqual([{ kind: 'unchanged', text: 'My first draft.' }]);
    expect(reviewChanges('', '')).toEqual([]);
  });

  it('keeps matching text unmarked and identifies added and removed words', () => {
    expect(reviewChanges('A good post.', 'A great post!')).toEqual([
      { kind: 'unchanged', text: 'A ' },
      { kind: 'removed', text: 'good' },
      { kind: 'added', text: 'great' },
      { kind: 'unchanged', text: ' post' },
      { kind: 'removed', text: '.' },
      { kind: 'added', text: '!' },
    ]);
  });

  it.each([
    ['Unchanged draft', 'Unchanged draft'],
    ['Remove everything', ''],
    ['First\n\nLast', 'First\nMiddle\nLast'],
    ['Hello 👩🏽‍💻 café', 'Hello 👨‍💻 café!'],
    ['one two one two', 'one three one two'],
    ['你好，世界', '你好，朋友'],
    ['a '.repeat(1200) + 'old', 'b '.repeat(1200) + 'new'],
  ])('preserves exact text when accepting or rejecting changes', (before, after) => {
    const segments = reviewChanges(before, after);
    expect(segments.filter((segment) => segment.kind !== 'added').map((segment) => segment.text).join('')).toBe(before);
    expect(segments.filter((segment) => segment.kind !== 'removed').map((segment) => segment.text).join('')).toBe(after);
  });
});
