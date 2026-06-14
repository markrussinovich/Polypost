// Shared media & links attached once at the master level and surfaced on every
// platform card, so the user doesn't re-add the same picture/video/URL in each
// platform's composer.
//
// Persistence split: link attachments are tiny and persist under their own key.
// Image/video files are session-only — we keep the File + an object URL in memory
// rather than base64 in localStorage (which would blow the quota). They surface on
// each card as a download/drag affordance for this session; reload clears them.
export type AttachmentKind = 'image' | 'video' | 'link';

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  // Image/video: the file name. Link: the display title.
  name: string;
  // Link only: the URL folded into post text and shown as a chip.
  url?: string;
  // Image/video only (session): the in-memory blob URL and originating file.
  objectUrl?: string;
  file?: File;
  mime?: string;
  size?: number;
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

// The URLs (in order) that get folded into each platform's post text + count.
export function linkUrls(attachments: Attachment[]): string[] {
  return attachments.filter((a) => a.kind === 'link' && a.url).map((a) => a.url as string);
}

// The trailing block appended to a platform's post text — one URL per line, set
// off by a blank line so it reads as a footer. Empty when there are no links.
export function formatLinksForText(urls: string[]): string {
  return urls.length ? `\n\n${urls.join('\n')}` : '';
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
    return Array.isArray(parsed) ? (parsed as Attachment[]).filter((a) => a.kind === 'link' && a.url) : [];
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
      .map((a) => ({ id: a.id, kind: a.kind, name: a.name, url: a.url }));
    window.localStorage.setItem(MEDIA_KEY, JSON.stringify(links));
  } catch {
    // Non-fatal: attachments still work in memory for this session.
  }
}
