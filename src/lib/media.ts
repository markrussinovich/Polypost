// Shared media & links attached once at the master level and surfaced on every
// platform card, so the user doesn't re-add the same picture/video/URL in each
// platform's composer.
//
// Persistence split: link attachments are tiny and persist under their own key.
// Image/video files keep their File + object URL in memory rather than base64 in
// localStorage (which would blow the quota); the raw Blob is persisted separately
// in IndexedDB (see lib/attachmentStore.ts) so it survives reload/restart and is
// rehydrated into a fresh object URL on load.
export type AttachmentKind = 'image' | 'video' | 'link';

// Cached link-unfurl metadata (Open Graph) for a link attachment. Fetched once via
// the microlink service and persisted with the link so the per-platform preview
// cards survive a reload without re-fetching. `manual` marks a user override that
// the auto-fetch must never clobber. Image/logo are remote URLs, not blobs.
export interface LinkPreview {
  status: 'loading' | 'ready' | 'failed' | 'manual';
  title?: string;
  description?: string;
  imageUrl?: string;
  logoUrl?: string;
  siteName?: string;
}

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  // Image/video: the file name. Link: the display title.
  name: string;
  // Link only: the URL folded into post text and shown as a chip.
  url?: string;
  // Link only: cached unfurl metadata for the per-platform preview cards.
  preview?: LinkPreview;
  // Image/video only: the in-memory blob URL and originating file (the Blob is
  // also persisted to IndexedDB via lib/attachmentStore.ts).
  objectUrl?: string;
  file?: File;
  mime?: string;
  size?: number;
}

export interface StoredAttachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  url?: string;
  preview?: LinkPreview;
  mime?: string;
  size?: number;
  dataUrl?: string;
}

const MEDIA_KEY = 'omnipost:media-v1';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `att-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function makeLinkAttachment(rawUrl: string, title?: string): Attachment {
  const url = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  return { id: newId(), kind: 'link', name: title?.trim() || url, url };
}

export function makeFileAttachment(file: File): Attachment {
  const kind: AttachmentKind = file.type.startsWith('video/') ? 'video' : 'image';
  return {
    id: newId(),
    kind,
    name: file.name,
    objectUrl: URL.createObjectURL(file),
    file,
    mime: file.type,
    size: file.size,
  };
}

// Release the object URL backing a session media attachment (call on removal).
export function revokeAttachment(attachment: Attachment): void {
  if (attachment.objectUrl) {
    URL.revokeObjectURL(attachment.objectUrl);
  }
}

// Put an image on the clipboard as a bitmap so it can be pasted straight into a
// composer (LinkedIn accepts pasted images). The async Clipboard API only reliably
// supports image/png, so non-PNG images are re-encoded to PNG via a canvas.
export async function copyImageToClipboard(attachment: Attachment): Promise<void> {
  if (attachment.kind !== 'image' || !attachment.file) {
    throw new Error('Only images can be copied to the clipboard.');
  }

  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('This browser does not support copying images.');
  }

  const png = attachment.file.type === 'image/png' ? attachment.file : await encodeAsPng(attachment.file);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

async function encodeAsPng(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not prepare the image for copying.');
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))), 'image/png');
  });
}

export function isLinkAttachment(attachment: Attachment): boolean {
  return attachment.kind === 'link';
}

// The hostname for a URL's domain row (e.g. "www.example.com" → "example.com"),
// falling back to the raw string when it can't be parsed.
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// A favicon URL for a link's domain — reuses the DuckDuckGo icon service the
// Sources panel already relies on, so no new third party is introduced.
export function faviconUrl(url: string): string {
  const host = hostnameOf(url);
  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
}

// Only links are persisted; file attachments are dropped (session-only). Stored
// without the File/objectUrl fields, which don't survive serialization anyway.
export function loadAttachments(): Attachment[] {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MEDIA_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return (parsed as Attachment[])
      .filter((a) => a.kind === 'link' && a.url)
      .slice(0, 1)
      // A persisted "loading" means the tab closed mid-fetch — drop it so the
      // fetch-on-need effect retries instead of leaving a stuck skeleton.
      .map((a) => (a.preview?.status === 'loading' ? { ...a, preview: undefined } : a));
  } catch {
    return [];
  }
}

export function saveAttachments(attachments: Attachment[]): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    const links = attachments
      .filter((a) => a.kind === 'link' && a.url)
      .slice(0, 1)
      .map((a) => ({ id: a.id, kind: a.kind, name: a.name, url: a.url, preview: a.preview }));
    window.localStorage.setItem(MEDIA_KEY, JSON.stringify(links));
  } catch {
    // Non-fatal: attachments still work in memory for this session.
  }
}

export async function serializeAttachmentsForDraft(attachments: Attachment[]): Promise<StoredAttachment[]> {
  const stored: StoredAttachment[] = [];

  for (const attachment of attachments.slice(0, 1)) {
    if (attachment.kind === 'link' && attachment.url) {
      stored.push({ id: attachment.id, kind: attachment.kind, name: attachment.name, url: attachment.url, preview: attachment.preview });
      continue;
    }

    const dataUrl = await attachmentDataUrl(attachment);

    if (dataUrl) {
      stored.push({
        id: attachment.id,
        kind: attachment.kind,
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
        dataUrl,
      });
    }
  }

  return stored;
}

export function restoreDraftAttachments(stored: StoredAttachment[] = []): Attachment[] {
  const attachments: Attachment[] = [];

  for (const attachment of stored.slice(0, 1)) {
    if (attachment.kind === 'link' && attachment.url) {
      attachments.push({ id: attachment.id, kind: 'link', name: attachment.name, url: attachment.url, preview: attachment.preview });
      continue;
    }

    if (!attachment.dataUrl || (attachment.kind !== 'image' && attachment.kind !== 'video')) {
      continue;
    }

    const file = fileFromDataUrl(attachment.dataUrl, attachment.name, attachment.mime);
    const objectUrl = URL.createObjectURL(file);

    attachments.push({
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.name,
      objectUrl,
      file,
      mime: file.type,
      size: file.size,
    });
  }

  return attachments;
}

async function attachmentDataUrl(attachment: Attachment): Promise<string | undefined> {
  if (attachment.file) {
    return blobToDataUrl(attachment.file);
  }

  if (!attachment.objectUrl) {
    return undefined;
  }

  try {
    const response = await fetch(attachment.objectUrl);
    const blob = await response.blob();
    return blobToDataUrl(blob);
  } catch {
    return undefined;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read attachment.')));
    reader.readAsDataURL(blob);
  });
}

function fileFromDataUrl(dataUrl: string, name: string, mime = 'application/octet-stream'): File {
  const [header, data = ''] = dataUrl.split(',', 2);
  const type = /data:([^;]+)/.exec(header)?.[1] ?? mime;
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], name, { type });
}
