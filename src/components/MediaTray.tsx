import { useRef, useState } from 'react';
import { Check, Copy, Download, ImagePlus, Link2, Plus, X } from 'lucide-react';

import { copyImageToClipboard, makeFileAttachment, makeLinkAttachment, type Attachment } from '../lib/media';

function handleMediaDragStart(event: React.DragEvent, attachment: Attachment) {
  if (attachment.objectUrl && attachment.mime) {
    // Enables drag-out to the OS / file inputs in Chromium browsers.
    event.dataTransfer.setData('DownloadURL', `${attachment.mime}:${attachment.name}:${attachment.objectUrl}`);
  }
}

interface MediaTrayProps {
  attachments: Attachment[];
  onAddAttachment: (attachment: Attachment) => void;
  onRemoveAttachment: (id: string) => void;
}

export function MediaTray({ attachments, onAddAttachment, onRemoveAttachment }: MediaTrayProps) {
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    // Snapshot the files BEFORE clearing the input: event.target.files is a live
    // FileList, so resetting value would empty it before we read it.
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    files.forEach((file) => onAddAttachment(makeFileAttachment(file)));
  }

  function handleAddLink() {
    const trimmed = linkUrl.trim();

    if (!trimmed) {
      return;
    }

    onAddAttachment(makeLinkAttachment(trimmed, linkTitle));
    setLinkUrl('');
    setLinkTitle('');
    setShowLink(false);
  }

  return (
    <details className="media-tray">
      <summary>
        Images &amp; links{attachments.length ? ` (${attachments.length})` : ''}
      </summary>
      <p className="media-hint">Add an image or a link once, then reuse it everywhere. Links fold into each platform's copied text automatically. For an image, click <strong>Copy image</strong> and paste it straight into the LinkedIn composer, or <strong>download</strong> / drag it into any other composer.</p>

      <div className="media-actions">
        <label className="secondary-action media-add media-file" title="Add an image">
          <ImagePlus aria-hidden="true" size={13} /> Add image
          <input type="file" accept="image/*" multiple onChange={handleFiles} />
        </label>
        <button type="button" className="secondary-action media-add" onClick={() => setShowLink((value) => !value)}>
          <Link2 aria-hidden="true" size={13} /> Link
        </button>
      </div>

      {showLink ? (
        <div className="media-link-row">
          <input
            type="text"
            value={linkTitle}
            placeholder="Label (optional)"
            aria-label="Link label"
            onChange={(event) => setLinkTitle(event.target.value)}
          />
          <input
            type="url"
            value={linkUrl}
            placeholder="https://example.com"
            aria-label="Link URL"
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddLink();
              }
            }}
          />
          <button type="button" className="primary-action media-add-confirm" disabled={!linkUrl.trim()} onClick={handleAddLink}>
            <Plus aria-hidden="true" size={13} /> Add
          </button>
        </div>
      ) : null}

      {attachments.length ? (
        <ul className="media-list">
          {attachments.map((attachment) => {
            const isFile = attachment.kind !== 'link';

            return (
              <li
                key={attachment.id}
                className={`media-item is-${attachment.kind}`}
                draggable={isFile && Boolean(attachment.objectUrl)}
                onDragStart={(event) => handleMediaDragStart(event, attachment)}
                title={isFile ? `${attachment.name} — drag into a composer or download` : attachment.url}
              >
                {attachment.kind === 'image' && attachment.objectUrl ? (
                  <img src={attachment.objectUrl} alt={attachment.name} className="media-thumb" />
                ) : attachment.kind === 'video' && attachment.objectUrl ? (
                  <video src={attachment.objectUrl} className="media-thumb" muted />
                ) : (
                  <span className="media-link-icon"><Link2 aria-hidden="true" size={16} /></span>
                )}
                <span className="media-item-name" title={attachment.url ?? attachment.name}>{attachment.name}</span>
                {attachment.kind === 'image' ? <CopyImageButton attachment={attachment} /> : null}
                {isFile && attachment.objectUrl ? (
                  <a className="media-download" href={attachment.objectUrl} download={attachment.name} aria-label={`Download ${attachment.name}`} title="Download">
                    <Download aria-hidden="true" size={14} />
                  </a>
                ) : null}
                <button type="button" className="media-remove" aria-label={`Remove ${attachment.name}`} onClick={() => onRemoveAttachment(attachment.id)}>
                  <X aria-hidden="true" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </details>
  );
}

type CopyState = 'idle' | 'copied' | 'error';

// Copies the image bitmap to the clipboard so it can be pasted into a composer.
function CopyImageButton({ attachment }: { attachment: Attachment }) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number | null>(null);

  function flash(next: CopyState) {
    setState(next);
    if (timer.current) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => setState('idle'), 1500);
  }

  async function handleCopy() {
    try {
      await copyImageToClipboard(attachment);
      flash('copied');
    } catch {
      flash('error');
    }
  }

  const label = state === 'copied' ? 'Copied!' : state === 'error' ? 'Copy failed' : 'Copy image';

  return (
    <button type="button" className={`media-copy is-${state}`} aria-label={`Copy ${attachment.name} as an image`} title={label} onClick={handleCopy}>
      {state === 'copied' ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
    </button>
  );
}
