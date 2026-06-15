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

    it('counts a bare domain as a flat 23, like X auto-links it', () => {
      // X shortens `example.com` to 23 even though it is 11 literal characters.
      expect(countCharacters('example.com', 'x-weighted')).toBe(23);
      // "Read more at " (13) + URL (23) = 36
      expect(countCharacters('Read more at example.com', 'x-weighted')).toBe(36);
    });

    it('counts the punctuation around a bare URL as text, not part of the link', () => {
      // "(" (1) + URL (23) + ")" (1) = 25
      expect(countCharacters('(example.com)', 'x-weighted')).toBe(25);
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

    it('counts a bare domain literally — Mastodon only auto-links http(s):// URLs', () => {
      // Unlike X, Mastodon requires a scheme, so example.com stays 11 chars.
      expect(countCharacters('example.com', 'mastodon')).toBe(11);
      expect(countCharacters('Read more at example.com', 'mastodon')).toBe(24);
      // An explicit-scheme URL is still shortened to a flat 23.
      expect(countCharacters('Read more at https://example.com/x', 'mastodon')).toBe(36);
    });
  });
});
