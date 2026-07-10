// URL detection for character counting and link warnings.
//
// X and Mastodon both shorten every auto-linked URL to a flat 23 characters, and
// both auto-link not only `http(s)://…` URLs but also `www.`-prefixed hosts and
// bare domains that end in a real TLD (`example.com`, `sub.example.co.uk`). A
// scheme-only matcher under-counts those: `example.com` would be counted as its
// 11 literal characters instead of 23, so a post sitting near the limit can look
// like it fits when the platform would actually reject it.
//
// Detection mirrors how the platforms auto-link, so a filename-like token whose
// extension happens to be a valid TLD (e.g. `README.md`, `setup.sh`) is treated
// as a link — exactly as X and Mastodon treat it. Modeled on twitter-text's URL
// extraction with a pragmatic TLD set: explicit-scheme URLs link regardless of
// TLD, while schemeless ones must end in a known TLD and not be part of an email
// address or a longer word.
//
// Known limitation: the TLD list below is a curated subset, not the full IANA
// registry, so a *bare* domain with an uncommon TLD (e.g. `example.community`)
// is counted literally where X would shorten it to 23 — an under-count. We trade
// exactness for a small, dependency-free table; the explicit-scheme form is
// always detected, so the gap is limited to schemeless bare domains, and the
// per-platform "counts are an estimate" disclaimer covers the residue.

const TLDS = [
  // Common gTLDs
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'info', 'biz',
  'io', 'ai', 'dev', 'app', 'co', 'me', 'tv', 'fm', 'xyz', 'tech',
  'online', 'site', 'store', 'blog', 'news', 'live', 'world', 'cloud',
  'design', 'studio', 'wiki', 'email', 'page', 'link', 'run', 'sh', 'gl', 'so',
  // Common ccTLDs
  'us', 'uk', 'ca', 'de', 'fr', 'es', 'it', 'nl', 'se', 'no', 'fi', 'dk',
  'pl', 'pt', 'ru', 'ua', 'jp', 'cn', 'kr', 'in', 'au', 'nz', 'br', 'mx',
  'za', 'ch', 'at', 'be', 'ie', 'cz', 'gr', 'tr', 'il', 'sg', 'hk', 'tw',
  'id', 'my', 'th', 'vn', 'ph', 'md',
];

// A DNS label is at most 63 characters; bounding the inner run (rather than an
// unbounded `*`) also keeps the schemeless branch linear-time on a long
// whitespace-free token that never resolves to a valid TLD.
const DOMAIN_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const TLD = '(?:' + TLDS.join('|') + ')';
const PORT = '(?::\\d{2,5})?';
const PATH = '(?:[/?#][^\\s]*)?';

// Explicit-scheme URL, any host.
const SCHEME_URL = 'https?:\\/\\/[^\\s]+';
// …plus a schemeless host ending in a known TLD. The schemeless branch is
// guarded so it never starts mid-word, after a `.`, or after an `@` (an email's
// domain), and the TLD must be followed by a non-word boundary so
// `example.community` doesn't match as `example.com`.
const SCHEMELESS_URL =
  '(?<![@\\w.])(?:' + DOMAIN_LABEL + '\\.)+' + TLD + '(?![a-z0-9@-])' + PORT + PATH;

// Compiled once: the patterns are constant, and this runs on every keystroke.
// The global forms are only ever consumed via String.prototype.matchAll, which
// iterates on a clone and so never leaves lastIndex state on the shared object.
const URL_REGEX_GLOBAL = new RegExp(SCHEME_URL + '|' + SCHEMELESS_URL, 'giu');
const SCHEME_URL_REGEX_GLOBAL = new RegExp(SCHEME_URL, 'giu');

interface UrlSpan {
  // Start offset of the (trimmed) URL within the input string.
  index: number;
  // Length of the trimmed URL in UTF-16 code units.
  length: number;
  url: string;
}

export interface ExtractUrlsOptions {
  // Whether to also match schemeless URLs (bare domains and www. hosts). X
  // auto-links these (default true); Mastodon does not — it requires an explicit
  // http(s):// scheme — so its counter passes false.
  schemeless?: boolean;
}

export function extractUrls(text: string, options: ExtractUrlsOptions = {}): UrlSpan[] {
  const regex = options.schemeless === false ? SCHEME_URL_REGEX_GLOBAL : URL_REGEX_GLOBAL;
  const spans: UrlSpan[] = [];

  for (const match of text.matchAll(regex)) {
    const url = trimTrailingPunctuation(match[0]);
    if (url.length === 0) {
      continue;
    }
    spans.push({ index: match.index ?? 0, length: url.length, url });
  }

  return spans;
}

export function containsUrl(text: string): boolean {
  // Delegate to extractUrls so detection can't drift from counting.
  return extractUrls(text).length > 0;
}

// Drop trailing characters a greedy match swallows from surrounding prose (X and
// Mastodon don't link them): "(see example.com)." links only the URL. A closing
// bracket is kept when the URL also contains its opener, so paths like
// /Foo_(bar) survive intact.
function trimTrailingPunctuation(url: string): string {
  let end = url.length;

  while (end > 0) {
    const char = url[end - 1];

    if ('.,;:!?…\'"'.includes(char)) {
      end -= 1;
      continue;
    }

    const opener = char === ')' ? '(' : char === ']' ? '[' : char === '}' ? '{' : '';
    if (opener) {
      const slice = url.slice(0, end);
      if (occurrences(slice, char) > occurrences(slice, opener)) {
        end -= 1;
        continue;
      }
    }

    break;
  }

  return url.slice(0, end);
}

function occurrences(text: string, char: string): number {
  return text.split(char).length - 1;
}
