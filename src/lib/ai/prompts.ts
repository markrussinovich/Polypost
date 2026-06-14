import type { PlatformSpec } from '../platforms/types';

export interface LlmRequest {
  system: string;
  prompt: string;
}

// Describes a platform's constraints to the model. Built entirely from the pure
// PlatformSpec so the spec stays the single source of truth (see forward-compat plan).
export function buildPlatformPromptContext(spec: PlatformSpec): string {
  const lines = [
    `Platform: ${spec.label}`,
    `Character limit: ${spec.charLimit}`,
    spec.allowUnicodeStyling
      ? 'You may use Markdown for light emphasis — **bold**, *italic*, bullet lists with "- ", and links [text](url). It is converted to the platform\'s styled text. Use it sparingly on key phrases.'
      : 'Use plain text only — no Markdown, no asterisks, and no styled characters (this platform renders them as literal symbols or hurts reach).',
  ];

  if (spec.counting === 'graphemes') {
    lines.push('Length is counted in characters (grapheme clusters).');
  } else if (spec.counting === 'x-weighted') {
    lines.push('URLs count as 23 characters; some characters (CJK, emoji) count as 2.');
  }

  for (const warning of spec.warnings) {
    lines.push(`Note: ${warning.message}`);
  }

  return lines.join('\n');
}

// Appends the user's freeform voice/style guidance to a base system prompt.
function withStyle(baseSystem: string, style?: string): string {
  const trimmed = style?.trim();
  return trimmed ? `${baseSystem}\n\nFollow this voice/style guidance from the user: ${trimmed}` : baseSystem;
}

// Rewrite the master post to fit a platform's length and formatting. `limit` is
// the budget for the post text itself; it can be lower than spec.charLimit when
// shared links will be appended and consume part of the platform's limit.
export function buildFitRequest(spec: PlatformSpec, masterText: string, style?: string, limit: number = spec.charLimit): LlmRequest {
  const reserved = spec.charLimit - limit;
  const reservedNote = reserved > 0
    ? ` Note: ${reserved} characters are reserved for attached links, so your text must fit within ${limit}.`
    : '';

  return {
    system: withStyle(
      'You adapt a social media post for a specific platform. Preserve the author\'s voice, key message, hashtags, and @mentions. ' +
        'Tighten or restructure as needed so it fits the platform\'s limit. The length limit is a hard requirement. ' +
        'Return ONLY the adapted post text — no preamble, quotes, or explanation.',
      style,
    ),
    prompt:
      `${buildPlatformPromptContext(spec)}\n\n` +
      `Rewrite the post below so it fits within ${limit} characters for ${spec.label}.${reservedNote} ` +
      `Staying within ${limit} characters is required — count as you write.\n\n` +
      `Post:\n${masterText}`,
  };
}

// Follow-up instruction when a fitted version still exceeds the limit.
export function buildOverLimitFeedback(spec: PlatformSpec, previousText: string, previousCount: number, limit: number = spec.charLimit): string {
  return (
    `That version was ${previousCount} characters — ${previousCount - limit} over the ${limit}-character limit for your text. ` +
    `Rewrite it to be at most ${limit} characters. Cut or condense content as needed.\n\n` +
    `Previous version:\n${previousText}`
  );
}

// Help author or revise the master draft from a freeform instruction. Optional
// `sources` is reference material (docs/URLs the user attached) the model should
// draw on as background — see buildSourcesBlock in sources.ts.
export function buildAuthorRequest(instruction: string, currentText: string, style?: string, sources?: string | null): LlmRequest {
  const hasDraft = Boolean(currentText.trim());
  const reference = sources?.trim()
    ? `Reference material (use as background; do not copy verbatim):\n${sources.trim()}\n\n`
    : '';

  return {
    system: withStyle(
      'You help write social media posts. Return ONLY the post text — no preamble, quotes, options, or explanation. ' +
        'Keep it natural and ready to publish. You may use Markdown for light formatting: **bold**, *italic*, ' +
        'bullet lists with "- ", and links as [text](url). On platforms that support styling (e.g. LinkedIn) bold/italic ' +
        'render as styled text; elsewhere they appear as plain text. Use formatting sparingly for emphasis.',
      style,
    ),
    prompt: hasDraft
      ? `${reference}Current draft:\n${currentText}\n\nInstruction: ${instruction}\n\nReturn the revised post.`
      : `${reference}Write a social media post. Instruction: ${instruction}`,
  };
}
