import { getSchema } from '@tiptap/core';

import { editorExtensions } from './editorConfig';
import { createDraftId, loadDraftHistory, type DraftSnapshot } from './storage';
import type { Source } from './ai/sources';
import type { EditorNode } from './exportText';
import type { StoredAttachment } from './media';
import { PLATFORMS_BY_ID } from './platforms';
import type { PlatformId } from './platforms/types';
import { parsePlatformThreads } from './postThreads';

const DB_NAME = 'polypost-draft-library';
const STORE = 'snapshots';
const META = 'meta';
export const MAX_RECOVERY_CHECKPOINTS = 20;
const schema = getSchema(editorExtensions);

export interface LibraryDraft extends DraftSnapshot {
  kind: 'draft' | 'recovery';
}

export type SnapshotContent = Pick<DraftSnapshot,
  'document' | 'overrides' | 'aiVersions' | 'threads' | 'enabledPlatforms' | 'sources' | 'attachments' | 'characterCount'>;

export function createLibraryDraft(
  content: SnapshotContent,
  title: string,
  kind: LibraryDraft['kind'] = 'draft',
  existing?: LibraryDraft,
): LibraryDraft {
  const now = Date.now();
  return {
    ...content,
    id: existing?.id ?? createDraftId(),
    title: title.trim() || `Draft ${new Date(now).toLocaleString()}`,
    kind,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

async function openLibrary(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('The draft library needs IndexedDB, which is unavailable in this browser. Your editor autosave is unchanged.');
  }
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.result.createObjectStore(META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the draft library.'));
    request.onblocked = () => reject(new Error('Close other Polypost tabs and retry opening the draft library.'));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, META], 'readwrite');
      const request = tx.objectStore(META).get('legacy-migrated');
      request.onsuccess = () => {
        if (request.result) return;
        try {
          for (const legacy of loadDraftHistory()) {
            tx.objectStore(STORE).put(parseDraft({ ...legacy, kind: 'draft' }));
          }
          tx.objectStore(META).put(true, 'legacy-migrated');
        } catch (error) {
          tx.abort();
          reject(error);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Could not migrate saved drafts. The original drafts have been kept.'));
      tx.onerror = () => reject(tx.error ?? new Error('Could not read the draft library.'));
    });
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export async function listLibraryDrafts(): Promise<LibraryDraft[]> {
  const db = await openLibrary();
  try {
    return await new Promise<LibraryDraft[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      tx.oncomplete = () => resolve((request.result as LibraryDraft[]).sort((a, b) => b.updatedAt - a.updatedAt));
      tx.onabort = () => reject(tx.error ?? new Error('Could not load saved drafts.'));
      tx.onerror = () => reject(tx.error ?? new Error('Could not load saved drafts.'));
    });
  } finally {
    db.close();
  }
}

async function writeDrafts(drafts: LibraryDraft[], deleteId?: string): Promise<void> {
  const db = await openLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const draft of drafts) store.put(draft);
      if (deleteId) store.delete(deleteId);
      const request = store.getAll();
      request.onsuccess = () => {
        const recoveries = (request.result as LibraryDraft[])
          .filter((draft) => draft.kind === 'recovery')
          .sort((a, b) => b.updatedAt - a.updatedAt);
        for (const old of recoveries.slice(MAX_RECOVERY_CHECKPOINTS)) store.delete(old.id);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Draft library save failed. No changes were committed.'));
      tx.onerror = () => reject(tx.error ?? new Error('Draft library save failed. Check available browser storage.'));
    });
  } finally {
    db.close();
  }
}

export function saveLibraryDraft(draft: LibraryDraft): Promise<void> {
  return writeDrafts([draft]);
}

export function deleteLibraryDraft(id: string): Promise<void> {
  return writeDrafts([], id);
}

export function exportLibraryBackup(drafts: LibraryDraft[], current: LibraryDraft): string {
  // Project through the same allowlist as import: settings and credentials are
  // not part of the backup format, even if extra fields exist on stored records.
  return JSON.stringify({
    format: 'polypost-backup',
    version: 1,
    exportedAt: Date.now(),
    drafts: [...drafts, current].map(parseDraft),
  }, null, 2);
}

export function parseLibraryBackup(text: string): LibraryDraft[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('This is not a valid JSON backup.');
  }
  if (!isRecord(payload) || payload.format !== 'polypost-backup' || payload.version !== 1 || !Array.isArray(payload.drafts)) {
    throw new Error('This is not a supported Polypost backup (version 1).');
  }
  try {
    return payload.drafts.map(parseDraft);
  } catch {
    throw new Error('The backup contains an invalid draft, thread, source, or attachment. Nothing was imported.');
  }
}

export async function importLibraryBackup(text: string): Promise<number> {
  const drafts = parseLibraryBackup(text).map((draft) => ({
    ...draft,
    // Additive import never overwrites a local draft, even for the same backup.
    id: createDraftId(),
    kind: 'draft' as const,
  }));
  await writeDrafts(drafts);
  return drafts.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected text.');
  return value;
}

function finiteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Expected a nonnegative number.');
  return value;
}

function platform(value: unknown): PlatformId {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(PLATFORMS_BY_ID, value)) throw new Error('Unknown platform.');
  return value as PlatformId;
}

function document(value: unknown): EditorNode {
  if (!isRecord(value) || value.type !== 'doc') throw new Error('Invalid document.');
  const node = schema.nodeFromJSON(value);
  node.check();
  return node.toJSON() as EditorNode;
}

function documents(value: unknown): Partial<Record<PlatformId, EditorNode>> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error('Invalid platform documents.');
  return Object.fromEntries(Object.entries(value).map(([id, doc]) => [platform(id), document(doc)]));
}

function source(value: unknown): Source {
  if (!isRecord(value) || !['doc', 'url', 'text'].includes(String(value.kind)) ||
      !['ready', 'needs-text'].includes(String(value.status))) throw new Error('Invalid source.');
  return {
    id: text(value.id),
    kind: value.kind as Source['kind'],
    title: text(value.title),
    text: text(value.text),
    charCount: finiteNumber(value.charCount),
    status: value.status as Source['status'],
    url: value.url === undefined ? undefined : httpUrl(value.url),
    needsTitle: value.needsTitle === true || undefined,
  };
}

function httpUrl(value: unknown): string {
  const url = text(value);
  if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Invalid URL.');
  return url;
}

function attachment(value: unknown): StoredAttachment {
  if (!isRecord(value) || !['image', 'video', 'link'].includes(String(value.kind))) throw new Error('Invalid attachment.');
  const kind = value.kind as StoredAttachment['kind'];
  const result: StoredAttachment = { id: text(value.id), name: text(value.name), kind };
  if (kind === 'link') {
    result.url = httpUrl(value.url);
    if (value.preview !== undefined) {
      if (!isRecord(value.preview) || !['loading', 'ready', 'failed', 'manual'].includes(String(value.preview.status))) {
        throw new Error('Invalid link preview.');
      }
      result.preview = { status: value.preview.status as NonNullable<StoredAttachment['preview']>['status'] };
      for (const key of ['title', 'description', 'siteName'] as const) {
        if (value.preview[key] !== undefined) result.preview[key] = text(value.preview[key]);
      }
      for (const key of ['imageUrl', 'logoUrl'] as const) {
        if (value.preview[key] !== undefined) result.preview[key] = httpUrl(value.preview[key]);
      }
    }
  } else {
    const dataUrl = text(value.dataUrl);
    const match = /^data:((?:image|video)\/[\w.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
    if (!match || !match[1].startsWith(`${kind}/`) || match[2].length % 4 !== 0) throw new Error('Invalid media data.');
    atob(match[2]);
    result.dataUrl = dataUrl;
    result.mime = match[1];
    result.size = value.size === undefined ? undefined : finiteNumber(value.size);
  }
  return result;
}

function parseDraft(value: unknown): LibraryDraft {
  if (!isRecord(value)) throw new Error('Invalid draft.');
  if (value.kind !== 'draft' && value.kind !== 'recovery') throw new Error('Invalid draft kind.');
  if (value.enabledPlatforms !== undefined && !Array.isArray(value.enabledPlatforms)) throw new Error('Invalid platforms.');
  if (value.sources !== undefined && !Array.isArray(value.sources)) throw new Error('Invalid sources.');
  if (value.attachments !== undefined && !Array.isArray(value.attachments)) throw new Error('Invalid attachments.');
  if (Array.isArray(value.attachments) && value.attachments.length > 1) throw new Error('Only one attachment is supported.');
  return {
    id: text(value.id),
    title: text(value.title),
    kind: value.kind,
    createdAt: finiteNumber(value.createdAt),
    updatedAt: finiteNumber(value.updatedAt),
    characterCount: finiteNumber(value.characterCount),
    document: document(value.document),
    overrides: documents(value.overrides),
    aiVersions: documents(value.aiVersions),
    threads: value.threads === undefined ? undefined : parsePlatformThreads(value.threads),
    enabledPlatforms: Array.isArray(value.enabledPlatforms) ? value.enabledPlatforms.map(platform) : undefined,
    sources: Array.isArray(value.sources) ? value.sources.map(source) : undefined,
    attachments: Array.isArray(value.attachments) ? value.attachments.map(attachment) : undefined,
  };
}
