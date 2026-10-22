import { beforeEach, describe, expect, it } from 'vitest';

import type { EditorNode } from './exportLinkedInText';
import { loadDraftHistory, loadWorkspace, saveDraftSnapshot, saveWorkspace } from './storage';

const DRAFT_HISTORY_KEY = 'linkedin-format:draft-history-v1';

const LEGACY_DRAFT_KEY = 'linkedin-format:draft-v1';
const WORKSPACE_KEY = 'omnipost:workspace-v2';

function makeDoc(textValue: string): EditorNode {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: textValue }] }] };
}

describe('workspace storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips master, overrides, and enabledPlatforms', () => {
    const input = {
      master: makeDoc('Master post'),
      overrides: { x: makeDoc('X variant') },
      enabledPlatforms: ['linkedin', 'x', 'bluesky'] as const,
      aiVersions: { bluesky: makeDoc('Accepted AI version') },
    };

    expect(saveWorkspace({ ...input, enabledPlatforms: [...input.enabledPlatforms] }).ok).toBe(true);

    const { workspace } = loadWorkspace();
    expect(workspace?.master).toEqual(input.master);
    expect(workspace?.overrides.x).toEqual(input.overrides.x);
    expect(workspace?.enabledPlatforms).toEqual(['linkedin', 'x', 'bluesky']);
    expect(workspace?.aiVersions).toEqual(input.aiVersions);
  });

  it('migrates a legacy v1 draft into a v2 workspace without destroying the legacy key', () => {
    const legacy = makeDoc('Legacy draft');
    window.localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(legacy));

    const { workspace } = loadWorkspace();

    expect(workspace?.master).toEqual(legacy);
    expect(workspace?.overrides).toEqual({});
    expect(workspace?.enabledPlatforms).toEqual(['linkedin']);
    // Migration writes the v2 key...
    expect(window.localStorage.getItem(WORKSPACE_KEY)).not.toBeNull();
    // ...and never deletes the legacy key (the extension still uses it).
    expect(window.localStorage.getItem(LEGACY_DRAFT_KEY)).toBe(JSON.stringify(legacy));
  });

  it('returns a null workspace when nothing is stored', () => {
    expect(loadWorkspace()).toEqual({ workspace: null, error: null });
  });

  it('falls back to the legacy draft when the v2 payload is corrupt', () => {
    window.localStorage.setItem(WORKSPACE_KEY, '{ not valid json');
    const legacy = makeDoc('Recovered');
    window.localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(legacy));

    const { workspace } = loadWorkspace();
    expect(workspace?.master).toEqual(legacy);
  });

  it('rejects a v2 payload with the wrong version or shape', () => {
    window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 1, master: makeDoc('x') }));
    const { workspace, error } = loadWorkspace();

    expect(workspace).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe('draft snapshots with platform customizations', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips overrides and enabledPlatforms in a snapshot', () => {
    saveDraftSnapshot(makeDoc('Master'), 'Launch', 6, {
      overrides: { x: makeDoc('X variant') },
      enabledPlatforms: ['linkedin', 'x'],
    });

    const [restored] = loadDraftHistory();
    expect(restored.overrides?.x).toEqual(makeDoc('X variant'));
    expect(restored.enabledPlatforms).toEqual(['linkedin', 'x']);
  });

  it('still loads legacy snapshots that predate platform fields', () => {
    const legacySnapshot = {
      id: 'legacy-1',
      title: 'Old draft',
      createdAt: 1,
      updatedAt: 1,
      characterCount: 3,
      document: makeDoc('Old'),
    };
    window.localStorage.setItem(DRAFT_HISTORY_KEY, JSON.stringify([legacySnapshot]));

    const [restored] = loadDraftHistory();
    expect(restored.document).toEqual(makeDoc('Old'));
    expect(restored.overrides).toBeUndefined();
    expect(restored.enabledPlatforms).toBeUndefined();
  });
});
