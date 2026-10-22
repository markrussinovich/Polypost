import type { EditorNode } from '../exportText';
import type { PlatformId } from '../platforms/types';

export interface AiProposal {
  before: EditorNode;
  after: EditorNode;
  master: EditorNode;
  platform?: PlatformId;
  instruction?: string;
  truncated: boolean;
}

export interface ReviewSegment {
  kind: 'unchanged' | 'added' | 'removed';
  text: string;
}

export interface ReviewChange {
  before: string;
  after: string;
  changed: boolean;
}

export function groupReviewChanges(segments: ReviewSegment[]): ReviewChange[] {
  const changes: ReviewChange[] = [];
  for (const segment of segments) {
    if (segment.kind === 'unchanged') {
      changes.push({ before: segment.text, after: segment.text, changed: false });
      continue;
    }
    let last = changes[changes.length - 1];
    if (!last?.changed) {
      last = { before: '', after: '', changed: true };
      changes.push(last);
    }
    if (segment.kind === 'removed') last.before += segment.text;
    else last.after += segment.text;
  }
  return changes;
}

// Bound the comparison table for large imported drafts. Beyond that budget,
// retain the shared edges and show the intervening passage as a replacement.
const MAX_COMPARISON_CELLS = 1_000_000;

export function reviewChanges(before: string, after: string): ReviewSegment[] {
  if (!before.trim()) return after ? [{ kind: 'unchanged', text: after }] : [];
  const tokenize = (text: string) => text.match(/[\p{L}\p{N}\p{M}_]+|\s+|[^\p{L}\p{N}\p{M}_\s]/gu) ?? [];
  const left = tokenize(before);
  const right = tokenize(after);
  const segments: ReviewSegment[] = [];
  const append = (kind: ReviewSegment['kind'], text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last?.kind === kind) last.text += text;
    else segments.push({ kind, text });
  };

  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let endLeft = left.length;
  let endRight = right.length;
  while (endLeft > start && endRight > start && left[endLeft - 1] === right[endRight - 1]) {
    endLeft -= 1;
    endRight -= 1;
  }
  append('unchanged', left.slice(0, start).join(''));
  const rows = endLeft - start + 1;
  const columns = endRight - start + 1;
  if (rows * columns > MAX_COMPARISON_CELLS) {
    append('removed', left.slice(start, endLeft).join(''));
    append('added', right.slice(start, endRight).join(''));
  } else {
    const lengths = new Uint32Array(rows * columns);
    for (let i = rows - 2; i >= 0; i -= 1) {
      for (let j = columns - 2; j >= 0; j -= 1) {
        lengths[i * columns + j] = left[start + i] === right[start + j]
          ? lengths[(i + 1) * columns + j + 1] + 1
          : Math.max(lengths[(i + 1) * columns + j], lengths[i * columns + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < rows - 1 || j < columns - 1) {
      if (i < rows - 1 && j < columns - 1 && left[start + i] === right[start + j]) {
        append('unchanged', left[start + i]);
        i += 1;
        j += 1;
      } else if (i < rows - 1 && (j === columns - 1 || lengths[(i + 1) * columns + j] >= lengths[i * columns + j + 1])) {
        append('removed', left[start + i]);
        i += 1;
      } else {
        append('added', right[start + j]);
        j += 1;
      }
    }
  }
  append('unchanged', left.slice(endLeft).join(''));
  return segments;
}
