import { describe, expect, it } from 'vitest';

import { countCharacters } from './counting';

describe('countCharacters', () => {
  describe('nfc-codepoints', () => {
    it('counts ASCII by code point', () => {
      expect(countCharacters('hello', 'nfc-codepoints')).toBe(5);
    });

    it('counts an emoji as its code points and normalizes NFC', () => {
      // A single astral emoji is one code point via Array.from.
      expect(countCharacters('🚀', 'nfc-codepoints')).toBe(1);
      // Decomposed é (e + combining acute) normalizes to a single code point.
      expect(countCharacters('é', 'nfc-codepoints')).toBe(1);
    });
  });

  describe('graphemes', () => {
    it('counts a regional-indicator flag as one grapheme', () => {
      // 🇺🇸 is two code points but one user-perceived character.
      expect(countCharacters('🇺🇸', 'graphemes')).toBe(1);
      expect(countCharacters('🇺🇸', 'nfc-codepoints')).toBe(2);
    });

    it('counts a ZWJ family emoji as one grapheme', () => {
      expect(countCharacters('👨‍👩‍👧', 'graphemes')).toBe(1);
    });

    it('counts plain text the same as code points', () => {
      expect(countCharacters('hello', 'graphemes')).toBe(5);
    });
  });

  describe('x-weighted', () => {
    it('counts each URL as a flat 23 regardless of its real length', () => {
      const shortUrl = 'https://a.co';
      const longUrl = 'https://example.com/some/very/long/path?with=query&params=here';

      expect(countCharacters(shortUrl, 'x-weighted')).toBe(23);
      expect(countCharacters(longUrl, 'x-weighted')).toBe(23);
    });

    it('weighs ASCII as 1 and wide (CJK) characters as 2', () => {
      expect(countCharacters('hello', 'x-weighted')).toBe(5);
      // Three CJK characters at weight 2 each.
      expect(countCharacters('日本語', 'x-weighted')).toBe(6);
    });

    it('combines surrounding text and a URL', () => {
      // "see " (4) + URL (23) = 27
      expect(countCharacters('see https://a.co', 'x-weighted')).toBe(27);
    });

    it('keeps trailing sentence punctuation out of the URL', () => {
      // "see " (4) + URL (23) + "," (1) = 28 — X treats the comma as text.
      expect(countCharacters('see https://a.co,', 'x-weighted')).toBe(28);
      // Exported links render as "Label (https://url)": "Go " (3) + "(" (1) + URL (23) + ")" (1) = 28.
      expect(countCharacters('Go (https://a.co)', 'x-weighted')).toBe(28);
    });

    it('keeps a balanced parenthesised URL intact', () => {
      expect(countCharacters('https://en.wikipedia.org/wiki/A_(B)', 'x-weighted')).toBe(23);
    });

    it('matches URLs with an uppercase protocol', () => {
      expect(countCharacters('HTTPS://example.com', 'x-weighted')).toBe(23);
    });

    it('weighs bare domains as URLs like X does', () => {
      expect(countCharacters('example.com/path', 'x-weighted')).toBe(23);
      // "see " (4) + a.co (23) + " now" (4) = 31.
      expect(countCharacters('see a.co now', 'x-weighted')).toBe(31);
    });

    it('does not treat email addresses or plain sentences as URLs', () => {
      expect(countCharacters('mail me@example.com', 'x-weighted')).toBe(19);
      // "e.g" has a one-letter TLD and stays literal.
      expect(countCharacters('e.g. this', 'x-weighted')).toBe(9);
    });

    it('weighs every emoji grapheme as 2 regardless of its code points', () => {
      expect(countCharacters('🚀', 'x-weighted')).toBe(2);
      expect(countCharacters('👨‍👩‍👧', 'x-weighted')).toBe(2); // ZWJ family
      expect(countCharacters('👍🏽', 'x-weighted')).toBe(2); // skin tone
      expect(countCharacters('🇺🇸', 'x-weighted')).toBe(2); // flag
      expect(countCharacters('1️⃣', 'x-weighted')).toBe(2); // keycap
      // "hi " (3) + family (2) = 5
      expect(countCharacters('hi 👨‍👩‍👧', 'x-weighted')).toBe(5);
    });
  });

  describe('mastodon', () => {
    it('counts each URL as a flat 23', () => {
      expect(countCharacters('https://example.com/some/very/long/path', 'mastodon')).toBe(23);
      expect(countCharacters('see https://a.co', 'mastodon')).toBe(27); // 4 + 23
    });

    it('counts code points without weighting CJK as 2 (unlike X)', () => {
      expect(countCharacters('hello', 'mastodon')).toBe(5);
      expect(countCharacters('日本語', 'mastodon')).toBe(3);
      expect(countCharacters('🚀', 'mastodon')).toBe(1);
    });

    it('keeps trailing sentence punctuation out of the URL', () => {
      // "see " (4) + URL (23) + "," (1) = 28.
      expect(countCharacters('see https://a.co,', 'mastodon')).toBe(28);
      // "Go " (3) + "(" (1) + URL (23) + ")" (1) = 28.
      expect(countCharacters('Go (https://a.co)', 'mastodon')).toBe(28);
    });

    it('counts bare domains as a flat 23 and matches uppercase protocols', () => {
      expect(countCharacters('example.com/path', 'mastodon')).toBe(23);
      expect(countCharacters('HTTPS://example.com', 'mastodon')).toBe(23);
    });

    it('does not treat email addresses as URLs', () => {
      expect(countCharacters('mail me@example.com', 'mastodon')).toBe(19);
    });
  });
});
