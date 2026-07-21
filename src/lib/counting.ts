import { URL_PATTERN } from './unicodeStyles';

// How a platform measures post length against its limit.
// - 'nfc-codepoints': Unicode code points after NFC normalization (LinkedIn, most platforms).
// - 'graphemes': user-perceived characters / grapheme clusters (Bluesky).
// - 'x-weighted': X/Twitter's weighted scheme — most characters count as 1,
//   wide ranges (CJK, emoji) as 2, and each URL as a fixed 23.
// - 'mastodon': like nfc-codepoints, but every URL counts as a flat 23 (Mastodon
//   counts links as 23 chars; unlike X it does NOT weight CJK/emoji as 2).
export type CountingMethod = 'nfc-codepoints' | 'graphemes' | 'x-weighted' | 'mastodon';

const URL_WEIGHT = 23;

// Conservative bare-domain matcher ("example.com/path", "a.co"): X and
// Mastodon weight protocol-less URLs as a flat 23 too. Used ONLY for counting —
// link previews and styling keep requiring an explicit protocol, so
// URL_PATTERN itself is unchanged. Deliberately conservative: at least one
// dot, an alphabetic 2+ letter TLD ending at a word boundary, not preceded by
// @ (email addresses) or ./- (paths, mid-token positions), and the optional
// path stops before trailing sentence punctuation, mirroring URL_PATTERN.
const BARE_DOMAIN_PATTERN =
  /(?<![\w@./-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b(?:\/(?:(?:\([^\s()]*\)|[^\s()])*(?:\([^\s()]*\)|[^\s.,!?;:)\]}'"»›]))?)?/giu;

// Shape alone over-counts badly for a tech audience: Node.js, file.txt, and
// package.json all look like domains. X validates against the full IANA TLD
// list; this trades that for a curated set of TLDs people actually post bare
// (an uncommon-TLD bare domain falls back to literal counting, the same
// behavior every bare domain had before this matcher existed). Deliberately
// omits TLDs that collide with everyday file extensions (.md, .py, .rs, .zip).
const BARE_DOMAIN_TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int',
  'io', 'co', 'ai', 'app', 'dev', 'me', 'tv', 'gg', 'ms', 'fm', 'am', 'ly', 'sh', 'so', 'to', 'gl', 'is', 'be',
  'xyz', 'info', 'biz', 'pro', 'top', 'vip', 'icu', 'one', 'fyi', 'wiki', 'club', 'shop', 'store', 'blog',
  'news', 'site', 'online', 'space', 'website', 'tech', 'cloud', 'social', 'network', 'systems', 'tools',
  'codes', 'design', 'studio', 'agency', 'digital', 'media', 'email', 'live', 'life', 'world', 'today',
  'zone', 'link', 'page', 'art', 'fun', 'win', 'red', 'blue', 'green', 'work',
  'us', 'uk', 'ca', 'de', 'fr', 'jp', 'cn', 'in', 'au', 'br', 'ru', 'es', 'it', 'nl', 'se', 'no', 'fi',
  'dk', 'pl', 'pt', 'ch', 'at', 'ie', 'nz', 'za', 'kr', 'tw', 'hk', 'sg', 'mx', 'ar', 'cl', 'eu', 'cz',
  'gr', 'hu', 'ro', 'sk', 'ua', 'il', 'tr', 'sa', 'ae', 'id', 'th', 'vn', 'ph', 'my',
]);

// The TLD of a bare-domain match (the last dotted label before any path).
function bareDomainTld(match: string): string {
  const domain = match.split('/', 1)[0];
  return domain.slice(domain.lastIndexOf('.') + 1).toLowerCase();
}

// A grapheme cluster renders as emoji when it contains a pictographic or
// emoji-presentation code point, or emoji plumbing (VS16, combining keycap,
// regional indicators, skin-tone modifiers).
const EMOJI_CLUSTER_PATTERN =
  /\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{FE0F}\u{20E3}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/u;

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

// Code points, but each URL counts as a flat 23 (Mastodon's rule). No CJK/emoji
// doubling. Approximation: a mention's instance domain isn't excluded (OmniPost's
// @[Name] tokens have no domain to strip).
function countMastodon(normalized: string): number {
  return countWithUrlWeight(normalized, (segment) => Array.from(segment).length);
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
// Emoji are weighed per grapheme cluster (any emoji = 2, X's rule) rather than
// per code point, so ZWJ families / skin tones / flags / keycaps don't
// over-count. Remaining approximation (bare-domain shape vs. X's exact TLD
// list) is surfaced via the X disclaimer.
function countXWeighted(normalized: string): number {
  return countWithUrlWeight(normalized, weightOfRange);
}

// Shared X/Mastodon URL handling: full URLs and bare domains weigh a flat 23,
// everything between them is weighed by the method-specific `weigh` callback.
function countWithUrlWeight(normalized: string, weigh: (segment: string) => number): number {
  let total = 0;
  let lastIndex = 0;

  for (const range of urlTokenRanges(normalized)) {
    total += weigh(normalized.slice(lastIndex, range.start)) + URL_WEIGHT;
    lastIndex = range.end;
  }

  return total + weigh(normalized.slice(lastIndex));
}

interface TokenRange {
  start: number;
  end: number;
}

function urlTokenRanges(normalized: string): TokenRange[] {
  const ranges: TokenRange[] = [];

  for (const match of normalized.matchAll(new RegExp(URL_PATTERN.source, 'gu'))) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  for (const match of normalized.matchAll(BARE_DOMAIN_PATTERN)) {
    if (!BARE_DOMAIN_TLDS.has(bareDomainTld(match[0]))) {
      continue;
    }

    const start = match.index;
    const end = start + match[0].length;

    // Skip bare-domain hits inside an already-matched full URL.
    if (!ranges.some((range) => start < range.end && end > range.start)) {
      ranges.push({ start, end });
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function weightOfRange(text: string): number {
  let total = 0;

  for (const cluster of graphemeClusters(text)) {
    if (EMOJI_CLUSTER_PATTERN.test(cluster)) {
      total += 2;
      continue;
    }

    for (const character of cluster) {
      const codePoint = character.codePointAt(0) ?? 0;
      total += isLightCodePoint(codePoint) ? 1 : 2;
    }
  }

  return total;
}

function graphemeClusters(text: string): string[] {
  if (!graphemeSegmenter) {
    return Array.from(text);
  }

  return Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment);
}

function isLightCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0 && codePoint <= 4351) ||
    (codePoint >= 8192 && codePoint <= 8205) ||
    (codePoint >= 8208 && codePoint <= 8223) ||
    (codePoint >= 8242 && codePoint <= 8247)
  );
}
