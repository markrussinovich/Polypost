import { getCharacterCountStatus } from '../constants';
import { countCharacters } from '../counting';
import { exportText, type EditorNode } from '../exportText';
import { flattenMentionTokens } from '../mentions';
import { blueskySpec } from './bluesky';
import { facebookSpec } from './facebook';
import { instagramSpec } from './instagram';
import { linkedinSpec } from './linkedin';
import { mastodonSpec } from './mastodon';
import { threadsSpec } from './threads';
import { xSpec } from './x';
import type { PlatformId, PlatformRender, PlatformSpec } from './types';

// Order here is the display order in the chip row and preview rail.
export const PLATFORMS: PlatformSpec[] = [
  linkedinSpec,
  xSpec,
  blueskySpec,
  threadsSpec,
  mastodonSpec,
  facebookSpec,
  instagramSpec,
];

// New users see these enabled; migrated users keep just LinkedIn (see storage).
export const DEFAULT_ENABLED_PLATFORMS: PlatformId[] = ['linkedin', 'x', 'bluesky'];

export const PLATFORMS_BY_ID = Object.fromEntries(
  PLATFORMS.map((spec) => [spec.id, spec]),
) as Record<PlatformId, PlatformSpec>;

// The single source of truth for a platform's final text. The preview rail,
// copy/intent actions, and any future publish path all run through here so what
// gets posted is exactly what the preview showed.
export function renderForPlatform(doc: EditorNode, spec: PlatformSpec): PlatformRender {
  // The web app never resolves real mentions (it only copies/previews), so
  // @[Name] tokens flatten to plain "@Name" for every platform.
  const text = flattenMentionTokens(exportText(doc, { unicodeStyling: spec.allowUnicodeStyling }), { collapseSpaces: !(spec.keepMentionSpaces ?? false) });
  const count = countCharacters(text, spec.counting);
  const status = getCharacterCountStatus(count, spec.charLimit, spec.warningThreshold);
  const warnings = spec.warnings.filter((rule) => rule.applies(text, doc));

  return {
    text,
    summary: { count, limit: spec.charLimit, remaining: spec.charLimit - count, status },
    warnings,
  };
}

export type { PlatformId, PlatformRender, PlatformSpec } from './types';
