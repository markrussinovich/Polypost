import { useEffect, useMemo, useState } from 'react';

import { youtubeThumbnail } from '../lib/linkPreview';
import { faviconUrl, hostnameOf, type Attachment, type LinkPreview } from '../lib/media';
import type { PlatformSpec } from '../lib/platforms/types';
import { PLATFORM_ICONS } from './platformIcons';

interface CardLinkPreviewProps {
  url: string;
  preview?: LinkPreview;
  spec: PlatformSpec;
}

interface CardImagePreviewProps {
  image: Attachment;
  spec: PlatformSpec;
}

// Renders a detected URL as the unfurl card this platform would show — mirroring
// each platform's real layout (large hero vs compact thumbnail, with/without the
// description). Purely illustrative: it does not affect the copied text or
// character count.
export function CardLinkPreview({ url, preview, spec }: CardLinkPreviewProps) {
  const style = spec.linkPreview;

  if (!style || !url) {
    return null;
  }

  return <LinkCard url={url} preview={preview} spec={spec} showDescription={style.showDescription} layout={style.layout} />;
}

export function CardImagePreview({ image, spec }: CardImagePreviewProps) {
  if (image.kind !== 'image' || !image.objectUrl) {
    return null;
  }

  return (
    <div className={`card-image-preview is-${spec.id}`} aria-label={`${spec.label} image preview`}>
      <img src={image.objectUrl} alt={image.name} />
    </div>
  );
}

interface LinkCardProps {
  url: string;
  preview?: LinkPreview;
  spec: PlatformSpec;
  showDescription: boolean;
  layout: 'large' | 'thumbnail';
}

function LinkCard({ url, preview, spec, showDescription, layout }: LinkCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  // Ordered image sources, falling through on load error to the placeholder:
  // the preview's own image first, then a derived YouTube thumbnail (which fills
  // in when the metadata fetch returned a title but no image).
  const imageCandidates = useMemo(() => {
    const candidates: string[] = [];

    if (preview?.imageUrl) {
      candidates.push(preview.imageUrl);
    }

    const youtube = youtubeThumbnail(url);

    if (youtube && !candidates.includes(youtube)) {
      candidates.push(youtube);
    }

    return candidates;
  }, [preview?.imageUrl, url]);

  const [imageIndex, setImageIndex] = useState(0);

  // Restart the fall-through whenever the candidate set changes (e.g. a pending
  // preview resolves), so a fresh image gets a chance before the placeholder.
  useEffect(() => {
    setImageIndex(0);
  }, [imageCandidates]);

  const Icon = PLATFORM_ICONS[spec.id];
  const domain = hostnameOf(url);
  const loading = !preview || preview.status === 'loading';

  const title = preview?.title || domain;
  const description = showDescription ? preview?.description : undefined;
  const imageUrl = imageCandidates[imageIndex];
  const logo = preview?.logoUrl || faviconUrl(url);

  return (
    <a
      className={`card-link-preview is-${layout} is-${spec.id}${loading ? ' is-loading' : ''}`}
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${spec.label} link preview: ${title}`}
    >
      <div className="card-link-preview-media">
        {loading ? (
          <span className="card-link-preview-skeleton" aria-hidden="true" />
        ) : imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" onError={() => setImageIndex((index) => index + 1)} />
        ) : (
          <span className="card-link-preview-placeholder" style={{ color: spec.brandColor }}>
            <Icon size={layout === 'large' ? 26 : 20} />
          </span>
        )}
      </div>
      <div className="card-link-preview-body">
        <span className="card-link-preview-title">{title}</span>
        {description ? <span className="card-link-preview-desc">{description}</span> : null}
        <span className="card-link-preview-domain">
          {logoFailed ? null : (
            <img
              className="card-link-preview-favicon"
              src={logo}
              alt=""
              width={14}
              height={14}
              onError={() => setLogoFailed(true)}
            />
          )}
          {domain}
        </span>
      </div>
    </a>
  );
}
