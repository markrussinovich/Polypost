import { describe, expect, it } from 'vitest';

import { countCharacters } from './counting';
import { blueskySpec } from './platforms/bluesky';
import { threadsSpec } from './platforms/threads';
import { xSpec } from './platforms/x';
import { isPlatformThreads, parsePlatformThreads, renderThreadPost, splitThreadText } from './postThreads';

const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim();

describe('platform thread splitting', () => {
  it.each([xSpec, blueskySpec, threadsSpec])('fits every numbered $label post without losing words', (spec) => {
    const text = 'A launch worth sharing. Keep all the important details.\n\n'.repeat(50).trim();
    const posts = splitThreadText(text, spec);
    expect(posts.length).toBeGreaterThan(1);
    expect(normalize(posts.join(' '))).toBe(normalize(text));
    posts.forEach((post, index) => {
      expect(countCharacters(`${post}\n\n${index + 1}/${posts.length}`, spec.counting)).toBeLessThanOrEqual(spec.charLimit);
    });
  });

  it('prefers paragraphs, then sentences, then words', () => {
    const spec = { ...xSpec, charLimit: 45 };
    expect(splitThreadText('First paragraph.\n\nSecond paragraph has a longer message.', spec, false)[0]).toBe('First paragraph.');
    expect(splitThreadText('First sentence. The next sentence has a very long ending.', spec, false)[0]).toBe('First sentence.');
    expect(splitThreadText('word '.repeat(20), spec, false)[0]).toBe('word word word word word word word word word');
  });

  it.each([xSpec, blueskySpec, threadsSpec])('respects $label Unicode counting without breaking clusters', (spec) => {
    const text = '👨‍👩‍👧‍👦 Café e\u0301 中文 '.repeat(100).trim();
    const posts = splitThreadText(text, spec);
    expect(normalize(posts.join(' '))).toBe(normalize(text));
    posts.forEach((post, index) =>
      expect(countCharacters(`${post}\n\n${index + 1}/${posts.length}`, spec.counting)).toBeLessThanOrEqual(spec.charLimit));
  });

  it('keeps full and bare URLs intact and uses weighted URL counts on X', () => {
    const url = `https://example.com/${'long-path-'.repeat(40)}`;
    const bare = `example.com/${'path-'.repeat(40)}`;
    const text = `${'Intro '.repeat(50)}${url} ${bare} ${'closing '.repeat(50)}`;
    const posts = splitThreadText(text, xSpec);
    expect(posts.filter((post) => post.includes(url))).toHaveLength(1);
    expect(posts.filter((post) => post.includes(bare))).toHaveLength(1);
    expect(normalize(posts.join(' '))).toBe(normalize(text));
    posts.forEach((post, index) =>
      expect(countCharacters(`${post}\n\n${index + 1}/${posts.length}`, xSpec.counting)).toBeLessThanOrEqual(280));
  });

  it('preserves an oversized URL rather than chopping it or silently dropping it', () => {
    const url = `https://example.com/${'a'.repeat(400)}`;
    const posts = splitThreadText(`Before ${url} After`, blueskySpec);
    expect(posts).toEqual(['Before', url, 'After']);
    const thread = { numbered: true, posts: posts.map((text, index) => ({ id: String(index), text })) };
    expect(renderThreadPost(thread, 1, blueskySpec).summary.status).toBe('over');
  });

  it('never splits emoji clusters, even when a word has to be split', () => {
    const emoji = '👨‍👩‍👧‍👦';
    const posts = splitThreadText(emoji.repeat(200), xSpec);
    expect(posts.join('')).toBe(emoji.repeat(200));
    expect(posts.every((post) => post.split(emoji).join('') === '')).toBe(true);
    posts.forEach((post, index) => expect(countCharacters(`${post}\n\n${index + 1}/${posts.length}`, 'x-weighted')).toBeLessThanOrEqual(280));
  });

  it('reserves enough numbering space when crossing ten and a hundred posts', () => {
    const spec = { ...xSpec, charLimit: 30 };
    const text = '1234567890'.repeat(250);
    const posts = splitThreadText(text, spec);
    expect(posts.length).toBeGreaterThan(100);
    expect(posts.join('')).toBe(text);
    posts.forEach((post, index) => expect(countCharacters(`${post}\n\n${index + 1}/${posts.length}`, spec.counting)).toBeLessThanOrEqual(30));
  });

  it('supports unnumbered posts and empty input', () => {
    expect(splitThreadText('a'.repeat(560), xSpec, false)).toEqual(['a'.repeat(280), 'a'.repeat(280)]);
    expect(splitThreadText(' \n ', xSpec)).toEqual([]);
  });

  it('renders counts and copied text including numbering and flattened mentions', () => {
    const thread = { numbered: true, posts: [{ id: 'a', text: 'Thanks @[Scott Hanselman]' }, { id: 'b', text: 'More' }] };
    expect(renderThreadPost(thread, 0, xSpec).text).toBe('Thanks @ScottHanselman\n\n1/2');
    expect(renderThreadPost({ ...thread, numbered: false }, 0, xSpec).text).toBe('Thanks @ScottHanselman');
    expect(renderThreadPost(thread, 0, xSpec).summary.count).toBe(countCharacters('Thanks @ScottHanselman\n\n1/2', 'x-weighted'));
  });
});

describe('thread storage validation', () => {
  it('accepts supported threads and projects only content fields', () => {
    const value = { x: { numbered: true, apiKey: 'not-content', posts: [{ id: 'a', text: 'Post', apiKey: 'not-content' }] } };
    expect(isPlatformThreads(value)).toBe(true);
    expect(parsePlatformThreads(value)).toEqual({ x: { numbered: true, posts: [{ id: 'a', text: 'Post' }] } });
  });

  it.each([
    null, [], { unknown: { numbered: false, posts: [{ id: 'a', text: 'Post' }] } },
    { linkedin: { numbered: false, posts: [{ id: 'a', text: 'Post' }] } },
    { x: { numbered: 'yes', posts: [{ id: 'a', text: 'Post' }] } },
    { x: { numbered: true, posts: [] } },
    { x: { numbered: true, posts: [{ id: 'a', text: 'Post' }, { id: 'a', text: 'Duplicate' }] } },
    { x: { numbered: true, posts: [{ id: '', text: 'Post' }] } },
    { x: { numbered: true, posts: [{ id: 'a', text: 3 }] } },
  ])('rejects malformed threads: %j', (value) => {
    expect(isPlatformThreads(value)).toBe(false);
    expect(() => parsePlatformThreads(value)).toThrow(/Invalid platform threads/);
  });
});
