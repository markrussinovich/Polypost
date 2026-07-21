// Generic "see more" cutoff estimation shared by every platform's feed
// preview. The LinkedIn-specific configs live in feedPreview.ts; per-platform
// configs live on each PlatformSpec.
export type PreviewMode = 'desktop' | 'mobile';

export interface TruncationConfig {
  visibleLines: number;
  approximateCharacters: number;
  approximateCharactersPerLine: number;
}

export function isTextTruncated(text: string, config: TruncationConfig): boolean {
  const normalized = text.replace(/\r\n?/g, '\n').trimEnd();

  if (!normalized.trim()) {
    return false;
  }

  // Grapheme clusters, matching collapseToPreview — measuring here in code
  // points would claim emoji-heavy text is truncated while the collapse
  // returns it whole, rendering a "…more" toggle that does nothing.
  return (
    countApproximateLines(normalized, config.approximateCharactersPerLine) > config.visibleLines ||
    graphemeClusters(normalized).length > config.approximateCharacters
  );
}

function countApproximateLines(text: string, approximateCharactersPerLine: number): number {
  return text.split('\n').reduce((lineCount, line) => {
    if (!line.trim()) {
      return lineCount + 1;
    }

    return lineCount + Math.max(1, Math.ceil(graphemeClusters(line).length / approximateCharactersPerLine));
  }, 0);
}

// The visible portion before "…more", matching the feed's "show N lines, then
// cut" behavior: stop at whichever comes first — `visibleLines` visual lines
// (explicit newlines plus wraps at `approximateCharactersPerLine`) or
// `approximateCharacters`. A mid-line cut backs off to a word boundary; a cut
// that lands on a newline keeps the whole last line. Returns the original text
// when nothing is hidden.
export function collapseToPreview(text: string, config: TruncationConfig): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  // Grapheme clusters, not code points: a cut between the halves of a flag or
  // inside a ZWJ sequence would leave a dangling half-emoji before the "…".
  const chars = graphemeClusters(normalized);

  let lines = 0;
  let column = 0;
  let cut = chars.length;

  for (let i = 0; i < chars.length; i += 1) {
    if (i >= config.approximateCharacters) {
      cut = i;
      break;
    }

    if (chars[i] === '\n') {
      lines += 1;
      column = 0;

      if (lines >= config.visibleLines) {
        // Keep the newline so the cut-on-newline handling below applies.
        cut = i + 1;
        break;
      }
    } else {
      column += 1;

      if (column > config.approximateCharactersPerLine) {
        // This character wrapped onto a new visual line; when that line is the
        // first hidden one, the character itself is hidden too — cut before it.
        lines += 1;
        column = 1;

        if (lines >= config.visibleLines) {
          cut = i;
          break;
        }
      }
    }
  }

  if (cut >= chars.length) {
    return text;
  }

  const cutOnNewline = cut > 0 && chars[cut - 1] === '\n';
  let slice = chars.slice(0, cut).join('').replace(/\s+$/u, '');

  if (!cutOnNewline) {
    const lastSpace = slice.lastIndexOf(' ');

    if (lastSpace > slice.length * 0.6) {
      slice = slice.slice(0, lastSpace).replace(/\s+$/u, '');
    }
  }

  return `${slice}…`;
}

const graphemeSegmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function graphemeClusters(text: string): string[] {
  if (!graphemeSegmenter) {
    return Array.from(text);
  }

  return Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment);
}
