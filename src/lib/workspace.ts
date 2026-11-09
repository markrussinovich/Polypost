import type { EditorNode } from './exportText';
import type { PlatformId } from './platforms/types';
import type { PlatformThreads, PostThread } from './postThreads';

// The full editor state: one master document, optional per-platform overrides/threads
// (a key present means that platform is "forked"/customized), and the set of
// platforms currently shown in the preview rail.
export interface Workspace {
  master: EditorNode;
  overrides: Partial<Record<PlatformId, EditorNode>>;
  enabledPlatforms: PlatformId[];
  threads?: PlatformThreads;
}

export function applyMasterEdit(workspace: Workspace, master: EditorNode): Workspace {
  return { ...workspace, master };
}

// Editing inside a platform pane forks it: the first edit creates the override,
// later edits update it. Non-forked platforms keep mirroring the master.
export function applyPaneEdit(workspace: Workspace, id: PlatformId, doc: EditorNode): Workspace {
  return { ...workspace, overrides: { ...workspace.overrides, [id]: doc } };
}

export function applyThreadEdit(workspace: Workspace, id: PlatformId, thread: PostThread): Workspace {
  return { ...workspace, threads: { ...workspace.threads, [id]: thread } };
}

// Re-sync a platform to the master, discarding its customization.
export function resyncPlatform(workspace: Workspace, id: PlatformId): Workspace {
  if (workspace.overrides[id] === undefined && !workspace.threads?.[id]) {
    return workspace;
  }

  const overrides = { ...workspace.overrides };
  delete overrides[id];
  const threads = { ...workspace.threads };
  delete threads[id];
  return { ...workspace, overrides, threads };
}

// Show/hide a platform. Disabling keeps any override dormant so re-enabling
// restores the customization.
export function togglePlatform(workspace: Workspace, id: PlatformId): Workspace {
  const isEnabled = workspace.enabledPlatforms.includes(id);
  const enabledPlatforms = isEnabled
    ? workspace.enabledPlatforms.filter((platform) => platform !== id)
    : [...workspace.enabledPlatforms, id];

  return { ...workspace, enabledPlatforms };
}

export function isForked(workspace: Workspace, id: PlatformId): boolean {
  return workspace.overrides[id] !== undefined ||
    (workspace.threads?.[id] !== undefined && workspace.threads[id]?.customized !== false);
}

// The single-post source; customized threads are stored separately.
export function documentFor(workspace: Workspace, id: PlatformId): EditorNode {
  return workspace.overrides[id] ?? workspace.master;
}

// Platforms that are hidden but still hold a customization (chip shows a dot).
export function dormantPlatforms(workspace: Workspace): PlatformId[] {
  return (Object.keys({ ...workspace.overrides, ...workspace.threads }) as PlatformId[]).filter(
    (id) => !workspace.enabledPlatforms.includes(id),
  );
}
