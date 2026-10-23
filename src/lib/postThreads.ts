import { countCharacters, graphemeClusters, urlTokenRanges } from './counting';
import { PLATFORMS_BY_ID, renderForPlatform } from './platforms';
import type { PlatformId, PlatformSpec } from './platforms/types';

export interface ThreadPost {
  id: string;
  text: string;
}

export interface PostThread {
  posts: ThreadPost[];
  numbered: boolean;
}

export type PlatformThreads = Partial<Record<PlatformId, PostThread>>;

export function renderThreadPost(thread: PostThread, index: number, spec: PlatformSpec) {
  const text = thread.posts[index].text + (thread.numbered ? `\n\n${index + 1}/${thread.posts.length}` : '');
  return renderForPlatform({
    type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  }, spec);
}

// URLs stay atomic; fallback splits are at grapheme boundaries, never inside emoji.
export function splitThreadText(text: string, spec: PlatformSpec, numbered = true): string[] {
  const atoms: string[] = [];
  let cursor = 0;
  for (const range of urlTokenRanges(text)) {
    for (const atom of graphemeClusters(text.slice(cursor, range.start))) atoms.push(atom);
    atoms.push(text.slice(range.start, range.end));
    cursor = range.end;
  }
  for (const atom of graphemeClusters(text.slice(cursor))) atoms.push(atom);

  let digits = 1;
  for (;;) {
    const suffix = numbered ? `\n\n${'9'.repeat(digits)}/${'9'.repeat(digits)}` : '';
    const posts = splitAtoms(atoms, spec, suffix);
    const needed = String(posts.length).length;
    if (!numbered || needed <= digits) return posts;
    digits = needed;
  }
}

function splitAtoms(atoms: string[], spec: PlatformSpec, suffix: string): string[] {
  const posts: string[] = [];
  let start = 0;
  while (start < atoms.length) {
    while (start < atoms.length && !atoms[start].trim()) start += 1;
    if (start === atoms.length) break;
    let end = start;
    let chunk = '';
    while (end < atoms.length) {
      const next = chunk + atoms[end];
      if (countCharacters(next + suffix, spec.counting) > spec.charLimit) break;
      chunk = next;
      end += 1;
    }
    if (end === start) {
      // An oversized URL/grapheme must be shown over-limit, not corrupted or lost.
      posts.push(atoms[start]);
      start += 1;
      continue;
    }
    if (end < atoms.length) {
      const boundary = preferredBoundary(chunk);
      if (boundary > 0 && chunk.slice(boundary).trim()) {
        let length = 0;
        end = start;
        while (length < boundary) length += atoms[end++].length;
        chunk = chunk.slice(0, length);
      }
    }
    posts.push(chunk.trim());
    start = end;
  }
  return posts;
}

function preferredBoundary(text: string): number {
  for (const pattern of [/(?:\r?\n){2,}/g, /[.!?。！？]["'”’)\]]*\s+/gu, /\s+/gu]) {
    const matches = [...text.matchAll(pattern)];
    const last = matches.at(-1);
    if (last && last.index > 0) return last.index + last[0].length;
  }
  return 0;
}

export function isPlatformThreads(value: unknown): value is PlatformThreads {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([id, thread]) =>
    Object.prototype.hasOwnProperty.call(PLATFORMS_BY_ID, id) &&
    PLATFORMS_BY_ID[id as PlatformId].capabilities.threads === true &&
    isPostThread(thread),
  );
}

function isPostThread(value: unknown): value is PostThread {
  if (!isRecord(value) || typeof value.numbered !== 'boolean' || !Array.isArray(value.posts) || !value.posts.length) return false;
  const posts: unknown[] = value.posts;
  if (!posts.every((post): post is ThreadPost =>
    isRecord(post) && typeof post.id === 'string' && Boolean(post.id) && typeof post.text === 'string')) return false;
  return new Set(posts.map((post) => post.id)).size === posts.length;
}

export function parsePlatformThreads(value: unknown): PlatformThreads {
  if (!isPlatformThreads(value)) throw new Error('Invalid platform threads.');
  return Object.fromEntries(Object.entries(value).map(([id, thread]) => [id, {
    numbered: thread.numbered,
    posts: thread.posts.map((post) => ({ id: post.id, text: post.text })),
  }]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
