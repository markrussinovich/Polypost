import type { EditorNode } from '../exportText';
import { PLATFORMS_BY_ID, renderForPlatform } from '../platforms';
import type { PlatformId } from '../platforms/types';

export interface AutofitSelection {
  // Enabled platforms whose master-derived text exceeds the limit and aren't user-customized.
  toFit: PlatformId[];
  // Existing AI versions that no longer apply (now fit, disabled, or user-customized).
  toClear: PlatformId[];
}

export interface AutofitInput {
  master: EditorNode;
  enabledPlatforms: PlatformId[];
  // Platforms the user has manually edited (their forks are sacred — never auto-touched).
  userForkedIds: ReadonlySet<PlatformId>;
  // Platforms that currently hold an AI-generated version.
  aiVersionIds: ReadonlySet<PlatformId>;
  // Shared links appended to every platform's text; counted toward the limit, so
  // a link that pushes a platform over its limit must trigger a fit.
  linkUrls?: string[];
}

function masterOverLimit(master: EditorNode, id: PlatformId, linkUrls: string[]): boolean {
  const spec = PLATFORMS_BY_ID[id];
  return spec ? renderForPlatform(master, spec, { linkUrls }).summary.count > spec.charLimit : false;
}

// Decides which platforms the idle auto-fit pass should (re)generate and which
// stale AI versions to drop. Pure — drives the debounced effect in App.
export function selectAutofit({ master, enabledPlatforms, userForkedIds, aiVersionIds, linkUrls = [] }: AutofitInput): AutofitSelection {
  const enabled = new Set(enabledPlatforms);

  const toFit = enabledPlatforms.filter((id) => !userForkedIds.has(id) && masterOverLimit(master, id, linkUrls));

  const toClear = [...aiVersionIds].filter(
    (id) => !enabled.has(id) || userForkedIds.has(id) || !masterOverLimit(master, id, linkUrls),
  );

  return { toFit, toClear };
}
