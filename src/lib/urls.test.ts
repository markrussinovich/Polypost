import { describe, expect, it } from 'vitest';

import { containsUrl, extractUrls } from './urls';

const urls = (text: string) => extractUrls(text).map((span) => span.url);

describe('extractUrls', () => {
  it('matches explicit http(s) URLs', () => {
    expect(urls('go to https://example.com/path?q=1 now')).toEqual(['https://example.com/path?q=1']);
    expect(urls('http://a.co')).toEqual(['http://a.co']);
  });

  it('matches explicit-scheme URLs even with an unusual host or no TLD', () => {
    expect(urls('serving on http://localhost:5173/app')).toEqual(['http://localhost:5173/app']);
  });

  it('matches bare domains that end in a known TLD', () => {
    expect(urls('Read more at example.com today')).toEqual(['example.com']);
    expect(urls('ship it: my-side-project.dev')).toEqual(['my-side-project.dev']);
  });

  it('matches www-prefixed hosts and multi-part TLDs with a path', () => {
    expect(urls('see www.example.com')).toEqual(['www.example.com']);
    expect(urls('docs at sub.example.co.uk/path?q=1')).toEqual(['sub.example.co.uk/path?q=1']);
  });

  it('returns the offset and length of each match', () => {
    const [span] = extractUrls('hi example.com');
    expect(span).toEqual({ index: 3, length: 11, url: 'example.com' });
  });

  it('finds multiple URLs in one string', () => {
    expect(urls('https://a.co and example.org')).toEqual(['https://a.co', 'example.org']);
  });

  it('strips trailing sentence punctuation', () => {
    expect(urls('(see example.com).')).toEqual(['example.com']);
    expect(urls('visit https://example.com/path, please')).toEqual(['https://example.com/path']);
    expect(urls('done — example.com!')).toEqual(['example.com']);
  });

  it('keeps balanced parentheses inside a path', () => {
    expect(urls('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
      'https://en.wikipedia.org/wiki/Foo_(bar)',
    ]);
  });

  it('does not treat an email address as a URL', () => {
    expect(urls('mail me at foo@example.com')).toEqual([]);
  });

  it('does not match a word whose suffix is not a real TLD (matches X)', () => {
    expect(urls('this is fine.notatld really')).toEqual([]);
    // `com` is a TLD but must not match inside the longer word `community`.
    expect(urls('the example.community thrives').includes('example.com')).toBe(false);
  });

  it('known limitation: misses bare domains whose TLD is outside the curated list', () => {
    // X (twitter-text) auto-links example.community — `.community` is a real TLD —
    // and counts it as 23; our curated list omits it, so the bare form is missed.
    expect(urls('see example.community')).toEqual([]);
    // The explicit-scheme form is always detected, so the gap is narrow.
    expect(urls('see https://example.community')).toEqual(['https://example.community']);
  });

  it('matches only explicit-scheme URLs when schemeless is disabled (Mastodon)', () => {
    expect(extractUrls('see example.com', { schemeless: false })).toEqual([]);
    expect(extractUrls('see www.example.com', { schemeless: false })).toEqual([]);
    expect(extractUrls('see https://example.com/x', { schemeless: false }).map((s) => s.url)).toEqual([
      'https://example.com/x',
    ]);
  });

  it('does not match a domain label longer than the 63-char DNS limit', () => {
    // The label bound also keeps the matcher linear-time on a long bare token.
    expect(urls('a'.repeat(63) + '.com')).toEqual(['a'.repeat(63) + '.com']);
    expect(urls('a'.repeat(64) + '.com')).toEqual([]);
  });

  it('treats a filename whose extension is a real TLD as a link, matching the platforms', () => {
    // X and Mastodon both auto-link these, so counting them is faithful.
    expect(urls('open README.md')).toEqual(['README.md']);
    expect(urls('run setup.sh')).toEqual(['setup.sh']);
  });
});

describe('containsUrl', () => {
  it('detects explicit and schemeless URLs', () => {
    expect(containsUrl('see https://example.com')).toBe(true);
    expect(containsUrl('see example.com')).toBe(true);
    expect(containsUrl('see www.example.com')).toBe(true);
  });

  it('returns false for plain text and email addresses', () => {
    expect(containsUrl('just some words here')).toBe(false);
    expect(containsUrl('reach me at foo@example.com')).toBe(false);
  });

  it('does not carry regex state between calls', () => {
    expect(containsUrl('example.com')).toBe(true);
    expect(containsUrl('example.com')).toBe(true);
  });
});
