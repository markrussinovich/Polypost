// Persists the single active image/video attachment across reloads and app
// restarts (important once installed as a PWA). localStorage can't hold binaries
// without base64 bloat, so the raw Blob lives in IndexedDB instead. Link
// attachments are tiny and keep persisting via localStorage in media.ts.
//
// A single object store holds at most one record (key ATTACHMENT_KEY): the
// active attachment, mirroring the app's one-attachment-at-a-time model.
import { makeFileAttachment, type Attachment } from './media';

const DB_NAME = 'omnipost-attachments-v1';
const STORE = 'active';
const ATTACHMENT_KEY = 'current';

interface StoredBlobAttachment {
  id: string;
  name: string;
  mime: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open attachment store.'));
  });
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

// Save the active image/video attachment. No-op for link/non-file attachments
// (links persist elsewhere) and resilient to IndexedDB being unavailable.
export async function putActiveAttachment(attachment: Attachment): Promise<void> {
  if (!hasIndexedDb() || !attachment.file || (attachment.kind !== 'image' && attachment.kind !== 'video')) {
    return;
  }

  const record: StoredBlobAttachment = {
    id: attachment.id,
    name: attachment.name,
    mime: attachment.mime ?? attachment.file.type,
    blob: attachment.file,
  };

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record, ATTACHMENT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal: the attachment still works in memory for this session.
  }
}

// Restore the persisted attachment, rebuilding a File + object URL the same way
// restoreDraftAttachments does. Returns null when nothing is stored or on error.
export async function loadActiveAttachment(): Promise<Attachment | null> {
  if (!hasIndexedDb()) {
    return null;
  }

  try {
    const db = await openDb();
    const record = await new Promise<StoredBlobAttachment | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(ATTACHMENT_KEY);
      request.onsuccess = () => resolve(request.result as StoredBlobAttachment | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();

    if (!record) {
      return null;
    }

    const file = new File([record.blob], record.name, { type: record.mime });
    const attachment = makeFileAttachment(file);
    // Preserve the original id so it stays stable across the reload.
    return { ...attachment, id: record.id };
  } catch {
    return null;
  }
}

// Drop the persisted attachment (on removal/replacement). Resilient to errors.
export async function clearActiveAttachment(): Promise<void> {
  if (!hasIndexedDb()) {
    return;
  }

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(ATTACHMENT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal.
  }
}
