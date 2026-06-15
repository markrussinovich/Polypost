import { extractUrls, type ExtractUrlsOptions } from './urls';

// How a platform measures post length against its limit.
// - 'nfc-codepoints': Unicode code points after NFC normalization (LinkedIn, most platforms).
// - 'graphemes': user-perceived characters / grapheme clusters (Bluesky).
// - 'x-weighted': X/Twitter's weighted scheme — most characters count as 1,
//   wide ranges (CJK, emoji) as 2, and each URL as a fixed 23.
// - 'mastodon': like nfc-codepoints, but every URL counts as a flat 23 (Mastodon
//   counts links as 23 chars; unlike X it does NOT weight CJK/emoji as 2).
export type CountingMethod = 'nfc-codepoints' | 'graphemes' | 'x-weighted' | 'mastodon';

const URL_WEIGHT = 23;

const graphemeSegmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

export function countCharacters(text: string, method: CountingMethod): number {
  const normalized = text.normalize('NFC');

  switch (method) {
    case 'graphemes':
      return countGraphemes(normalized);
    case 'x-weighted':
      return countXWeighted(normalized);
    case 'mastodon':
      return countMastodon(normalized);
    case 'nfc-codepoints':
    default:
      return Array.from(normalized).length;
  }
}

// Counts text with each URL replaced by a flat 23, weighing the runs between
// URLs with the platform's own per-segment rule. Shared by the Mastodon and X
// counters, which differ in how a non-URL run is measured and in whether
// schemeless URLs count (X auto-links bare domains; Mastodon does not).
function countWithFlatUrls(
  normalized: string,
  weighSegment: (segment: string) => number,
  urlOptions?: ExtractUrlsOptions,
): number {
  let total = 0;
  let lastIndex = 0;

  for (const span of extractUrls(normalized, urlOptions)) {
    total += weighSegment(normalized.slice(lastIndex, span.index));
    total += URL_WEIGHT;
    lastIndex = span.index + span.length;
  }

  return total + weighSegment(normalized.slice(lastIndex));
}

// Code points, but each explicit-scheme URL counts as a flat 23 (Mastodon's
// rule). No CJK/emoji doubling, and — unlike X — bare domains are NOT shortened,
// since Mastodon only auto-links http(s):// URLs. Approximation: a mention's
// instance domain isn't excluded (Polypost's @[Name] tokens have no domain).
function countMastodon(normalized: string): number {
  return countWithFlatUrls(normalized, (segment) => Array.from(segment).length, { schemeless: false });
}

function countGraphemes(normalized: string): number {
  if (!graphemeSegmenter) {
    return Array.from(normalized).length;
  }

  let count = 0;
  for (const _segment of graphemeSegmenter.segment(normalized)) {
    count += 1;
  }

  return count;
}

// Port of twitter-text's default weighted counting (scale 100 collapsed to 1):
// URLs are a flat 23, "light" Unicode ranges weigh 1, everything else weighs 2.
// Approximation: emoji ZWJ sequences are counted per code point rather than as
// a single weight-2 glyph, so they over-count. Both this and the flat-23 URL
// rule are surfaced to the user via xSpec.disclaimer.
function countXWeighted(normalized: string): number {
  return countWithFlatUrls(normalized, weightOfRange);
}

function weightOfRange(text: string): number {
  let total = 0;

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    total += isLightCodePoint(codePoint) ? 1 : 2;
  }

  return total;
}

function isLightCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0 && codePoint <= 4351) ||
    (codePoint >= 8192 && codePoint <= 8205) ||
    (codePoint >= 8208 && codePoint <= 8223) ||
    (codePoint >= 8242 && codePoint <= 8247)
  );
}
