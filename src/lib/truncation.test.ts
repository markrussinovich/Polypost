import { describe, expect, it } from 'vitest';

import { collapseToPreview, isTextTruncated, type TruncationConfig } from './truncation';

// LinkedIn desktop-style config: 3 visible lines, ~70 chars/line, 210 char cap.
const config: TruncationConfig = {
  visibleLines: 3,
  approximateCharacters: 210,
  approximateCharactersPerLine: 70,
};

describe('collapseToPreview', () => {
  it('returns the text unchanged when it fits within the line and char budget', () => {
    const text = 'Line one\nLine two\nLine three';
    expect(collapseToPreview(text, config)).toBe(text);
  });

  it('cuts a multi-line post at the visible-line limit, not the char cap', () => {
    // Four short lines total well under 210 chars, but LinkedIn shows only three.
    const text = 'First line\nSecond line\nThird line\nFourth line should be hidden';
    const result = collapseToPreview(text, config);

    expect(result).toBe('First line\nSecond line\nThird line…');
    expect(result).not.toContain('Fourth');
  });

  it('cuts a long single paragraph at the char cap, backing off to a word boundary', () => {
    const text = `${'word '.repeat(60)}tail`; // 300+ chars, one line
    const result = collapseToPreview(text, config);

    expect(Array.from(result).length).toBeLessThanOrEqual(config.approximateCharacters + 1);
    expect(result.endsWith('…')).toBe(true);
    // No mid-word cut: the visible portion ends on a whole word.
    expect(result.slice(0, -1).trimEnd().endsWith('word')).toBe(true);
  });

  it('does not include any character of the first hidden line when a wrap cuts', () => {
    // 1 visible line of ~3 chars: 'abc' wraps before 'd', so 'd' belongs to
    // the hidden second line and must not leak into the preview.
    const tiny: TruncationConfig = { visibleLines: 1, approximateCharacters: 100, approximateCharactersPerLine: 3 };

    expect(collapseToPreview('abcdef', tiny)).toBe('abc…');
  });

  it('never cuts inside a regional-indicator flag', () => {
    // Cap of 4 graphemes: with code-point iteration the cut lands between the
    // two halves of the second flag, leaving a dangling regional indicator.
    const tiny: TruncationConfig = { visibleLines: 2, approximateCharacters: 4, approximateCharactersPerLine: 10 };

    expect(collapseToPreview('ab 🇺🇸🇺🇸', tiny)).toBe('ab 🇺🇸…');
  });

  it('never cuts inside a ZWJ emoji sequence', () => {
    // Each family emoji is five code points; a code-point cut splits it.
    const tiny: TruncationConfig = { visibleLines: 2, approximateCharacters: 4, approximateCharactersPerLine: 10 };

    expect(collapseToPreview('ab 👨‍👩‍👧👨‍👩‍👧', tiny)).toBe('ab 👨‍👩‍👧…');
  });

  it('agrees with isTextTruncated about whether anything is hidden', () => {
    const fits = 'Short post.';
    const overflows = 'a\nb\nc\nd\ne';

    expect(isTextTruncated(fits, config)).toBe(false);
    expect(collapseToPreview(fits, config)).toBe(fits);

    expect(isTextTruncated(overflows, config)).toBe(true);
    expect(collapseToPreview(overflows, config)).not.toBe(overflows);
  });

  it('agrees with isTextTruncated for emoji-heavy text', () => {
    // 100 family emoji = 100 graphemes (fits) but 500 code points; measuring
    // the two functions in different units rendered a dead "…more" toggle.
    const emojiHeavy = '👨‍👩‍👧'.repeat(100);

    expect(isTextTruncated(emojiHeavy, config)).toBe(false);
    expect(collapseToPreview(emojiHeavy, config)).toBe(emojiHeavy);

    const emojiOverflow = '👨‍👩‍👧'.repeat(211);
    expect(isTextTruncated(emojiOverflow, config)).toBe(true);
    expect(collapseToPreview(emojiOverflow, config)).not.toBe(emojiOverflow);
  });
});
