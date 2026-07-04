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
}

function masterOverLimit(master: EditorNode, id: PlatformId): boolean {
  const spec = PLATFORMS_BY_ID[id];
  return spec ? renderForPlatform(master, spec).summary.count > spec.charLimit : false;
}

// Decides which platforms the idle auto-fit pass should (re)generate and which
// stale AI versions to drop. Pure — drives the debounced effect in App.
export function selectAutofit({ master, enabledPlatforms, userForkedIds, aiVersionIds }: AutofitInput): AutofitSelection {
  const enabled = new Set(enabledPlatforms);

  const toFit = enabledPlatforms.filter((id) => !userForkedIds.has(id) && masterOverLimit(master, id));

  const toClear = [...aiVersionIds].filter(
    (id) => !enabled.has(id) || userForkedIds.has(id) || !masterOverLimit(master, id),
  );

  return { toFit, toClear };
}
