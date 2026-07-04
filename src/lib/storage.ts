import type { EditorNode } from './exportLinkedInText';
import type { Source } from './ai/sources';
import type { StoredAttachment } from './media';
import type { PlatformId } from './platforms/types';

const DRAFT_STORAGE_KEY = 'linkedin-format:draft-v1';
const DRAFT_HISTORY_KEY = 'linkedin-format:draft-history-v1';
const WORKSPACE_STORAGE_KEY = 'omnipost:workspace-v2';
const MAX_DRAFT_HISTORY = 10;

export interface DraftSnapshot {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  characterCount: number;
  document: EditorNode;
  // Added with multi-platform support; optional so older snapshots stay valid.
  overrides?: Partial<Record<PlatformId, EditorNode>>;
  // AI-generated per-platform versions (the session-only aiVersions map),
  // serialized so an AI-adapted card restores as it was. Optional for back-compat.
  aiVersions?: Partial<Record<PlatformId, EditorNode>>;
  enabledPlatforms?: PlatformId[];
  sources?: Source[];
  attachments?: StoredAttachment[];
}

export interface StoredWorkspace {
  version: 2;
  master: EditorNode;
  overrides: Partial<Record<PlatformId, EditorNode>>;
  enabledPlatforms: PlatformId[];
}

export interface WorkspaceInput {
  master: EditorNode;
  overrides: Partial<Record<PlatformId, EditorNode>>;
  enabledPlatforms: PlatformId[];
}

interface LoadWorkspaceResult {
  workspace: StoredWorkspace | null;
  error: string | null;
}

interface LoadDraftResult {
  document: EditorNode | null;
  error: string | null;
}

interface SaveDraftResult {
  ok: boolean;
  message: string;
}

interface SaveDraftSnapshotResult extends SaveDraftResult {
  draft?: DraftSnapshot;
}

export function loadDraft(): LoadDraftResult {
  if (!canUseStorage()) {
    return { document: null, error: null };
  }

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);

    if (!raw) {
      return { document: null, error: null };
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!isEditorNode(parsed)) {
      return { document: null, error: 'Stored draft could not be read, so the sample draft was restored.' };
    }

    return { document: parsed, error: null };
  } catch {
    return { document: null, error: 'Stored draft could not be read, so the sample draft was restored.' };
  }
}

export function saveDraft(document: EditorNode): SaveDraftResult {
  if (!canUseStorage()) {
    return { ok: false, message: 'Draft autosave is unavailable in this browser context.' };
  }

  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(document));
    return { ok: true, message: 'Draft saved.' };
  } catch {
    return { ok: false, message: 'Draft autosave failed. Your content is still in the editor.' };
  }
}

export function clearDraft(): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Reset should keep working even when storage is blocked.
  }
}

// Loads the multi-platform workspace. Falls back to migrating the legacy
// single-document draft (linkedin-format:draft-v1) the first time, writing the
// result to the v2 key. The legacy key is never deleted — the LinkedIn
// extension still reads/writes it on its own origin, and it stays as a fallback.
export function loadWorkspace(): LoadWorkspaceResult {
  if (!canUseStorage()) {
    return { workspace: null, error: null };
  }

  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    raw = null;
  }

  if (raw) {
    let parsed: unknown = null;

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    if (isStoredWorkspace(parsed)) {
      return { workspace: parsed, error: null };
    }

    // v2 present but corrupt/invalid: fall back to the legacy draft if any.
    return migrateLegacyDraft() ?? { workspace: null, error: 'Stored workspace could not be read, so the sample draft was restored.' };
  }

  return migrateLegacyDraft() ?? { workspace: null, error: null };
}

function migrateLegacyDraft(): LoadWorkspaceResult | null {
  const legacy = loadDraft();

  if (!legacy.document) {
    return legacy.error ? { workspace: null, error: legacy.error } : null;
  }

  const workspace: StoredWorkspace = {
    version: 2,
    master: legacy.document,
    overrides: {},
    enabledPlatforms: ['linkedin'],
  };

  saveWorkspace(workspace);
  return { workspace, error: legacy.error };
}

export function saveWorkspace(input: WorkspaceInput): SaveDraftResult {
  if (!canUseStorage()) {
    return { ok: false, message: 'Draft autosave is unavailable in this browser context.' };
  }

  try {
    const stored: StoredWorkspace = {
      version: 2,
      master: input.master,
      overrides: input.overrides,
      enabledPlatforms: input.enabledPlatforms,
    };
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(stored));
    return { ok: true, message: 'Draft saved.' };
  } catch {
    return { ok: false, message: 'Draft autosave failed. Your content is still in the editor.' };
  }
}

export function loadDraftHistory(): DraftSnapshot[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DRAFT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isDraftSnapshot).sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

interface DraftSnapshotExtras {
  overrides?: Partial<Record<PlatformId, EditorNode>>;
  aiVersions?: Partial<Record<PlatformId, EditorNode>>;
  enabledPlatforms?: PlatformId[];
  sources?: Source[];
  attachments?: StoredAttachment[];
}

export function saveDraftSnapshot(
  document: EditorNode,
  title: string,
  characterCount: number,
  extras: DraftSnapshotExtras = {},
): SaveDraftSnapshotResult {
  if (!canUseStorage()) {
    return { ok: false, message: 'Draft history is unavailable in this browser context.' };
  }

  try {
    const now = Date.now();
    const draft: DraftSnapshot = {
      id: createDraftId(),
      title: title.trim() || `Draft ${new Date(now).toLocaleString()}`,
      createdAt: now,
      updatedAt: now,
      characterCount,
      document,
      overrides: extras.overrides,
      aiVersions: extras.aiVersions,
      enabledPlatforms: extras.enabledPlatforms,
      sources: extras.sources,
      attachments: extras.attachments,
    };
    const drafts = [draft, ...loadDraftHistory()].slice(0, MAX_DRAFT_HISTORY);
    window.localStorage.setItem(DRAFT_HISTORY_KEY, JSON.stringify(drafts));
    return { ok: true, message: 'Draft saved to history.', draft };
  } catch {
    return { ok: false, message: 'Draft history save failed. Your current draft is still autosaved.' };
  }
}

export function deleteDraftSnapshot(id: string): SaveDraftResult {
  if (!canUseStorage()) {
    return { ok: false, message: 'Draft history is unavailable in this browser context.' };
  }

  try {
    const drafts = loadDraftHistory().filter((draft) => draft.id !== id);
    window.localStorage.setItem(DRAFT_HISTORY_KEY, JSON.stringify(drafts));
    return { ok: true, message: 'Saved draft deleted.' };
  } catch {
    return { ok: false, message: 'Saved draft could not be deleted.' };
  }
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function createDraftId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isEditorNode(value: unknown): value is EditorNode {
  return typeof value === 'object' && value !== null && 'type' in value;
}

function isStoredWorkspace(value: unknown): value is StoredWorkspace {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as StoredWorkspace;

  if (candidate.version !== 2 || !isEditorNode(candidate.master)) {
    return false;
  }

  if (!Array.isArray(candidate.enabledPlatforms) || !candidate.enabledPlatforms.every((id) => typeof id === 'string')) {
    return false;
  }

  if (typeof candidate.overrides !== 'object' || candidate.overrides === null) {
    return false;
  }

  return Object.values(candidate.overrides).every(isEditorNode);
}

function isDraftSnapshot(value: unknown): value is DraftSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as DraftSnapshot;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number' &&
    typeof candidate.characterCount === 'number' &&
    isEditorNode(candidate.document)
  );
}