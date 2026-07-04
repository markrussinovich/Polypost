import { useRef, useState } from 'react';
import { Copy, ImagePlus, X } from 'lucide-react';

import { copyImageToClipboard, makeFileAttachment, type Attachment } from '../lib/media';

interface ImageAttachmentControlProps {
  image: Attachment | null;
  onSetImage: (image: Attachment | null) => void;
}

type CopyState = 'idle' | 'copied' | 'error';

export function ImageAttachmentControl({ image, onSetImage }: ImageAttachmentControlProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const timer = useRef<number | null>(null);

  function flash(next: CopyState) {
    setCopyState(next);

    if (timer.current) {
      window.clearTimeout(timer.current);
    }

    timer.current = window.setTimeout(() => setCopyState('idle'), 1500);
  }

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    onSetImage(makeFileAttachment(file));
    setCopyState('idle');
  }

  async function handleCopy() {
    if (!image) {
      return;
    }

    try {
      await copyImageToClipboard(image);
      flash('copied');
    } catch {
      flash('error');
    }
  }

  return (
    <section className="image-attachment-panel" aria-label="Image attachment">
      <div className="image-attachment-actions">
        <label className="secondary-action image-add-button" title={image ? 'Replace image' : 'Add image'}>
          <ImagePlus aria-hidden="true" size={14} /> {image ? 'Replace image' : 'Add image'}
          <input type="file" accept="image/*" onChange={handleFiles} />
        </label>
        {image ? (
          <button type="button" className={`secondary-action image-copy-button is-${copyState}`} onClick={handleCopy}>
            <Copy aria-hidden="true" size={14} /> {copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Copy failed' : 'Copy image'}
          </button>
        ) : null}
      </div>

      {image?.objectUrl ? (
        <div className="image-attachment-item">
          <img src={image.objectUrl} alt={image.name} className="image-attachment-thumb" />
          <span className="image-attachment-name" title={image.name}>{image.name}</span>
          <button type="button" className="image-remove-button" aria-label={`Remove ${image.name}`} onClick={() => onSetImage(null)}>
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      ) : null}
    </section>
  );
}