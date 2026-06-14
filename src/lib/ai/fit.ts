import type { EditorNode } from '../exportText';
import { markdownToTipTap } from '../markdownToTipTap';
import { renderForPlatform } from '../platforms';
import type { PlatformSpec } from '../platforms/types';
import type { LlmConfig } from './config';
import { generateText } from './llmClient';
import { buildFitRequest, buildOverLimitFeedback } from './prompts';

export interface FitResult {
  doc: EditorNode;
  text: string;
  count: number;
  withinLimit: boolean;
  attempts: number;
}

export interface FitOptions {
  config: LlmConfig;
  spec: PlatformSpec;
  masterText: string;
  style?: string;
  signal?: AbortSignal;
  maxAttempts?: number;
  // Shared links that the card appends after the post text. They consume part of
  // the platform's limit, so the fit aims the text at (charLimit - link cost).
  linkUrls?: string[];
}

// How many characters the appended links cost for this platform (URL-weighting
// and the joining newlines included). Computed against a non-empty sample so the
// links actually render; stable regardless of the body for additive counters.
export function linkReserve(spec: PlatformSpec, linkUrls: string[]): number {
  if (linkUrls.length === 0) {
    return 0;
  }

  const sample: EditorNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] };
  const withLinks = renderForPlatform(sample, spec, { linkUrls }).summary.count;
  const withoutLinks = renderForPlatform(sample, spec).summary.count;
  return Math.max(0, withLinks - withoutLinks);
}

// Measures a candidate exactly the way its preview card will (same render path),
// so the deterministic check matches what the user sees.
function measure(text: string, spec: PlatformSpec): { doc: EditorNode; count: number } {
  // Parse Markdown so **bold**/*italic*/lists become real marks; platforms that
  // don't allow styling flatten them back to plain text at render time.
  const doc = markdownToTipTap(text);
  return { doc, count: renderForPlatform(doc, spec).summary.count };
}

// Generates a platform-fitted version, then deterministically checks the length
// and re-prompts the model to shorten until it fits (or attempts run out). The
// model isn't trusted to count — we verify and feed the real overage back.
export async function generateFit({ config, spec, masterText, style, signal, maxAttempts = 4, linkUrls = [] }: FitOptions): Promise<FitResult> {
  // The model writes the post text; the card appends links on top. So the text
  // itself must fit within the limit minus what the links cost.
  const effectiveLimit = Math.max(1, spec.charLimit - linkReserve(spec, linkUrls));
  const base = buildFitRequest(spec, masterText, style, effectiveLimit);
  let best: { doc: EditorNode; text: string; count: number } | null = null;
  let feedback = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prompt = feedback ? `${base.prompt}\n\n${feedback}` : base.prompt;
    const text = await generateText({ config, system: base.system, prompt, signal });
    const { doc, count } = measure(text, spec);

    if (count <= effectiveLimit) {
      return { doc, text, count, withinLimit: true, attempts: attempt };
    }

    if (!best || count < best.count) {
      best = { doc, text, count };
    }

    feedback = buildOverLimitFeedback(spec, text, count, effectiveLimit);

    if (signal?.aborted) {
      break;
    }
  }

  // Couldn't get fully under the limit — return the shortest attempt as a best effort.
  const fallback = best ?? measureToResult('', spec);
  return { ...fallback, withinLimit: false, attempts: maxAttempts };
}

function measureToResult(text: string, spec: PlatformSpec): { doc: EditorNode; text: string; count: number } {
  const { doc, count } = measure(text, spec);
  return { doc, text, count };
}
