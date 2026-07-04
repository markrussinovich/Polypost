import type { LinkPreview } from './media';
import { URL_PATTERN } from './unicodeStyles';

// Fetches a link's unfurl metadata (Open Graph) so the per-platform preview cards
// can show the graphic + title/description each platform would render. A direct
// browser fetch of an arbitrary page is CORS-blocked for nearly all sites, so we
// use microlink — a CORS-enabled service
// that returns normalized metadata as JSON. The free endpoint needs no API key
// but is rate-limited (~50 req/day per IP); results are cached on the attachment
// and a manual override is available, so real usage stays well within that.
const MICROLINK_ENDPOINT = 'https://api.microlink.io/';

// The subset of microlink's response we read. Everything is optional/defensive
// because it's an external payload.
interface MicrolinkResponse {
  status?: string;
  data?: {
    title?: string;
    description?: string;
    publisher?: string;
    image?: { url?: string } | null;
    screenshot?: { url?: string } | null;
    logo?: { url?: string } | null;
  };
}

// Pure mapping from a microlink payload to our LinkPreview — exported so it can be
// unit-tested without a network round-trip.
export function mapMicrolink(json: MicrolinkResponse): LinkPreview {
  if (json.status !== 'success' || !json.data) {
    return { status: 'failed' };
  }

  const { title, description, publisher, image, screenshot, logo } = json.data;

  return {
    status: 'ready',
    title: title?.trim() || undefined,
    description: description?.trim() || undefined,
    imageUrl: image?.url || screenshot?.url || undefined,
    logoUrl: logo?.url || undefined,
    siteName: publisher?.trim() || undefined,
  };
}

export function shouldRefreshLinkPreview(preview: LinkPreview | undefined, url: string): boolean {
  if (!preview) {
    return true;
  }

  if (preview.status === 'manual' || preview.status === 'loading') {
    return false;
  }

  if (preview.status === 'failed') {
    return true;
  }

  return !preview.imageUrl || isLowValueTitle(preview.title, url);
}

const YOUTUBE_ID_PATTERN = /^[\w-]{11}$/;

// YouTube thumbnails are derivable from the video id, so when a preview comes
// back without a usable image (common on the public deployment where the shared
// microlink quota returns title-only payloads) we can still show the real frame.
export function youtubeThumbnail(url: string): string | undefined {
  const id = youtubeVideoId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined;
}

function youtubeVideoId(url: string): string | undefined {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0];
    return YOUTUBE_ID_PATTERN.test(id) ? id : undefined;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v') ?? '';
      return YOUTUBE_ID_PATTERN.test(id) ? id : undefined;
    }

    const match = parsed.pathname.match(/^\/(?:embed|shorts|v|live)\/([\w-]{11})(?:[/?#]|$)/);
    return match ? match[1] : undefined;
  }

  return undefined;
}

export function urlsInText(text: string): string[] {
  return [...text.matchAll(new RegExp(URL_PATTERN.source, 'gu'))]
    .map((match) => normalizeTextUrl(match[0]))
    .filter((url) => url.length > 0);
}

export function lastUrlInText(text: string): string | undefined {
  return urlsInText(text).at(-1);
}

function normalizeTextUrl(url: string): string {
  let normalized = url.replace(/[.,!?;:]+$/u, '');

  while (hasUnmatchedClosingDelimiter(normalized)) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function hasUnmatchedClosingDelimiter(url: string): boolean {
  const last = url.at(-1);

  if (!last || !')]}'.includes(last)) {
    return false;
  }

  const opener = last === ')' ? '(' : last === ']' ? '[' : '{';
  return countChar(url, last) > countChar(url, opener);
}

function countChar(text: string, character: string): number {
  return [...text].filter((item) => item === character).length;
}

function isLowValueTitle(title: string | undefined, url: string): boolean {
  const normalizedTitle = title?.trim().toLowerCase();

  if (!normalizedTitle) {
    return true;
  }

  try {
    const parsed = new URL(url);
    const lastPathSegment = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) ?? '').toLowerCase();

    return normalizedTitle === parsed.hostname.toLowerCase() || normalizedTitle === lastPathSegment;
  } catch {
    return false;
  }
}

export async function fetchLinkPreview(url: string, signal?: AbortSignal): Promise<LinkPreview> {
  try {
    const params = new URLSearchParams({ screenshot: 'true', url });
    const response = await fetch(`${MICROLINK_ENDPOINT}?${params.toString()}`, { signal });

    if (!response.ok) {
      return { status: 'failed' };
    }

    return mapMicrolink((await response.json()) as MicrolinkResponse);
  } catch {
    // Network error, abort, rate-limit, or malformed JSON — degrade to the
    // favicon + domain + manual-entry fallback the card already handles.
    return { status: 'failed' };
  }
}
