import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createLibraryDraft,
  deleteLibraryDraft,
  exportLibraryBackup,
  importLibraryBackup,
  listLibraryDrafts,
  MAX_RECOVERY_CHECKPOINTS,
  parseLibraryBackup,
  saveLibraryDraft,
  type LibraryDraft,
} from './draftLibrary';
import { saveDraftSnapshot } from './storage';

function draft(title = 'Launch'): LibraryDraft {
  return createLibraryDraft({
    document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Master draft' }] }] },
    overrides: { x: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Custom X' }] }] } },
    aiVersions: { bluesky: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Accepted AI' }] }] } },
    threads: { x: { numbered: true, posts: [{ id: 'a', text: 'Thread first' }, { id: 'b', text: 'Thread second' }] } },
    enabledPlatforms: ['linkedin', 'x', 'bluesky'],
    sources: [{ id: 'source', kind: 'text', title: 'Background', text: 'Reference', charCount: 9, status: 'ready' }],
    attachments: [{ id: 'image', kind: 'image', name: 'image.png', dataUrl: 'data:image/png;base64,aGVsbG8=', mime: 'image/png', size: 5 }],
    characterCount: 12,
  }, title);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('indexedDB', new IDBFactory());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('durable draft library', () => {
  it('migrates legacy snapshots once without removing their original copy', async () => {
    const original = draft();
    saveDraftSnapshot(original.document, 'Legacy', 12, { overrides: original.overrides, attachments: original.attachments });
    const legacyCopy = window.localStorage.getItem('linkedin-format:draft-history-v1');

    const [migrated] = await listLibraryDrafts();
    expect(migrated.title).toBe('Legacy');
    expect(migrated.attachments).toEqual(original.attachments);
    expect(window.localStorage.getItem('linkedin-format:draft-history-v1')).toBe(legacyCopy);
    await deleteLibraryDraft(migrated.id);
    expect(await listLibraryDrafts()).toEqual([]);
  });

  it('keeps more than ten named drafts and updates a draft in place', async () => {
    for (let index = 0; index < 12; index += 1) {
      await saveLibraryDraft(draft(`Draft ${index}`));
    }
    const first = (await listLibraryDrafts())[0];
    const updated = createLibraryDraft({ ...first, characterCount: 99 }, 'Renamed', 'draft', first);
    await saveLibraryDraft(updated);
    const drafts = await listLibraryDrafts();
    expect(drafts).toHaveLength(12);
    expect(drafts.find((entry) => entry.id === first.id)).toMatchObject({
      title: 'Renamed', createdAt: first.createdAt, characterCount: 99,
    });
  });

  it('rotates recovery checkpoints without evicting named drafts', async () => {
    const named = draft('Keep forever');
    await saveLibraryDraft(named);
    for (let index = 0; index <= MAX_RECOVERY_CHECKPOINTS; index += 1) {
      await saveLibraryDraft({ ...draft(`Recovery ${index}`), kind: 'recovery', updatedAt: index });
    }
    const drafts = await listLibraryDrafts();
    expect(drafts.filter((entry) => entry.kind === 'recovery')).toHaveLength(MAX_RECOVERY_CHECKPOINTS);
    expect(drafts.some((entry) => entry.title === 'Recovery 0')).toBe(false);
    expect(drafts.find((entry) => entry.id === named.id)).toEqual(named);
  });

  it('round-trips variants, sources, attachments, and current workspace without overwriting local entries', async () => {
    const original = draft();
    await saveLibraryDraft(original);
    window.localStorage.setItem('omnipost:llm-config-v1', JSON.stringify({ apiKey: 'DO-NOT-EXPORT', model: 'private-setting' }));
    const withExtraField = { ...original, apiKey: 'EXTRA-SECRET' };
    const backup = exportLibraryBackup([withExtraField], draft('Current workspace'));
    expect(backup).not.toContain('DO-NOT-EXPORT');
    expect(backup).not.toContain('EXTRA-SECRET');
    expect(backup).not.toContain('private-setting');

    expect(await importLibraryBackup(backup)).toBe(2);
    const entries = await listLibraryDrafts();
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(3);
    const imported = entries.find((entry) => entry.id !== original.id && entry.title === original.title)!;
    expect(imported.overrides).toEqual(original.overrides);
    expect(imported.aiVersions).toEqual(original.aiVersions);
    expect(imported.threads).toEqual(original.threads);
    expect(imported.sources).toEqual(original.sources);
    expect(imported.attachments).toEqual(original.attachments);
  });

  it('rejects malformed documents or attachment data before importing any entries', async () => {
    await saveLibraryDraft(draft('Existing'));
    for (const broken of [
      { ...draft(), document: { type: 'doc', content: [{ type: 'unknownNode' }] } },
      { ...draft(), document: { type: 'doc', content: [{ type: 'text', text: 'Invalid at root' }] } },
      { ...draft(), attachments: [{ id: 'bad', kind: 'image', name: 'bad.png', dataUrl: 'not a data URL' }] },
      { ...draft(), enabledPlatforms: ['unknown'] },
      { ...draft(), sources: [{ kind: 'text' }] },
      { ...draft(), threads: { x: { numbered: true, posts: [] } } },
      { ...draft(), threads: { linkedin: { numbered: true, posts: [{ id: 'a', text: 'Unsupported' }] } } },
      { ...draft(), threads: { x: { numbered: true, posts: [{ id: 'a', text: 'One' }, { id: 'a', text: 'Duplicate ID' }] } } },
    ]) {
      await expect(importLibraryBackup(JSON.stringify({
        format: 'polypost-backup', version: 1, drafts: [draft('Valid first entry'), broken],
      }))).rejects.toThrow(/invalid draft/i);
      expect(await listLibraryDrafts()).toHaveLength(1);
    }
  });

  it('rejects unsupported backup versions and reports storage unavailability', async () => {
    expect(() => parseLibraryBackup('not json')).toThrow(/valid JSON/i);
    expect(() => parseLibraryBackup('{"format":"polypost-backup","version":2,"drafts":[]}')).toThrow(/supported/i);
    vi.stubGlobal('indexedDB', undefined);
    await expect(saveLibraryDraft(draft())).rejects.toThrow(/unavailable/i);
  });
});
