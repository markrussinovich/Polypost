import { useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Link2, Loader, Pencil, RotateCcw, Sparkles } from 'lucide-react';

import { copyPlainText } from '../lib/clipboard';
import type { EditorNode } from '../lib/exportText';
import type { Attachment } from '../lib/media';
import type { PlatformRender, PlatformSpec } from '../lib/platforms/types';
import { isTextTruncated, type PreviewMode, type TruncationConfig } from '../lib/truncation';
import { CharacterMeter } from './CharacterMeter';
import { PaneEditor } from './PaneEditor';
import { PLATFORM_ICONS } from './platformIcons';

interface PlatformCardProps {
  spec: PlatformSpec;
  render: PlatformRender;
  // Document seeding the pane editor: the override when forked, else the master.
  document: EditorNode;
  isForked: boolean;
  // Holds an AI-fitted version (and isn't user-forked).
  isAiAdapted: boolean;
  // Shared media & links surfaced on every card. Links are already folded into
  // render.text; files (image/video) show as download/drag handles here.
  attachments: Attachment[];
  // An AI fit is in flight for this platform.
  isGenerating: boolean;
  // AI endpoint is configured, so the "Adapt with AI" action is available.
  aiReady: boolean;
  isEditing: boolean;
  // Remount key for non-forked pane editors so they reseed when the master changes.
  masterVersion: number;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onPaneChange: (document: EditorNode) => void;
  onResync: () => void;
  onFit: () => void;
}

type CopyFlash = 'idle' | 'copied' | 'error';

const MODE_LABELS: Record<PreviewMode, string> = { desktop: 'Desktop', mobile: 'Mobile' };

export function PlatformCard({
  spec,
  render,
  document,
  isForked,
  isAiAdapted,
  attachments,
  isGenerating,
  aiReady,
  isEditing,
  masterVersion,
  onStartEditing,
  onStopEditing,
  onPaneChange,
  onResync,
  onFit,
}: PlatformCardProps) {
  const Icon = PLATFORM_ICONS[spec.id];

  // Feed cutoff breakpoints this platform defines (e.g. LinkedIn: desktop + mobile).
  const truncationModes = spec.truncation ? (Object.keys(spec.truncation) as PreviewMode[]) : [];
  const [previewMode, setPreviewMode] = useState<PreviewMode>(truncationModes[0] ?? 'desktop');
  // Start expanded so the card shows the full post; the "…more"/"less…" toggle
  // still lets the user preview how the feed collapses it.
  const [expanded, setExpanded] = useState(true);

  const activeCutoff = spec.truncation?.[previewMode] ?? null;
  const truncated = activeCutoff ? isTextTruncated(render.text, activeCutoff) : false;
  // Offer the Desktop/Mobile switch only when there's more than one breakpoint
  // and at least one of them would actually cut the current post.
  const anyModeTruncates = truncationModes.some((mode) => {
    const config = spec.truncation?.[mode];
    return config ? isTextTruncated(render.text, config) : false;
  });
  const showModeToggle = truncationModes.length > 1 && anyModeTruncates && !isEditing;

  const hasText = Boolean(render.text.trim());
  const showCollapsed = truncated && !expanded && activeCutoff !== null;
  const displayText = showCollapsed && activeCutoff ? collapseText(render.text, activeCutoff) : render.text;

  const [copyFlash, setCopyFlash] = useState<CopyFlash>('idle');
  const flashTimer = useRef<number | null>(null);

  function flash(state: CopyFlash) {
    setCopyFlash(state);

    if (flashTimer.current) {
      window.clearTimeout(flashTimer.current);
    }

    flashTimer.current = window.setTimeout(() => setCopyFlash('idle'), 1800);
  }

  async function handleCopy() {
    try {
      await copyPlainText(render.text);
      flash('copied');
    } catch {
      flash('error');
    }
  }

  async function handleCopyAndOpen() {
    const composer = spec.capabilities.openComposer;

    if (!composer) {
      return;
    }

    try {
      await copyPlainText(render.text);
      const composerWindow = window.open(composer.url(render.text), '_blank');

      if (composerWindow) {
        composerWindow.opener = null;
      }

      flash('copied');
    } catch {
      flash('error');
    }
  }

  return (
    <article className={`platform-card is-${spec.id} is-${render.summary.status}${isForked ? ' is-forked' : ''}${isAiAdapted ? ' is-ai' : ''}`} aria-label={`${spec.label} preview`}>
      <header className="platform-card-header">
        <span className="platform-card-brand" style={{ color: spec.brandColor }}>
          <Icon size={18} />
          <span className="platform-card-label">{spec.label}</span>
          {showModeToggle ? (
            <span className="platform-card-modes" role="group" aria-label={`${spec.label} feed view`}>
              {truncationModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`card-mode-button${previewMode === mode ? ' is-active' : ''}`}
                  aria-pressed={previewMode === mode}
                  onClick={() => setPreviewMode(mode)}
                >
                  {MODE_LABELS[mode]}
                </button>
              ))}
            </span>
          ) : null}
          {isForked ? <span className="platform-card-badge">Customized</span> : null}
          {!isForked && isAiAdapted ? <span className="platform-card-badge is-ai">AI</span> : null}
          {isGenerating ? (
            <span className="platform-card-badge is-generating">
              <Loader aria-hidden="true" size={12} className="spin" /> Adapting…
            </span>
          ) : null}
        </span>
        <span className="platform-card-actions">
          {aiReady && !isEditing ? (
            <button type="button" className="card-icon-button card-ai-button" title={`Adapt for ${spec.label} with AI`} aria-label={`Adapt the post for ${spec.label} with AI`} disabled={isGenerating} onClick={onFit}>
              <Sparkles aria-hidden="true" size={15} />
            </button>
          ) : null}
          {isForked || isAiAdapted ? (
            <button type="button" className="card-icon-button" title="Re-sync from master draft" aria-label={`Re-sync ${spec.label} from the master draft`} onClick={onResync}>
              <RotateCcw aria-hidden="true" size={15} />
            </button>
          ) : null}
          {isEditing ? (
            <button type="button" className="card-icon-button is-done" title="Done editing" aria-label={`Done editing ${spec.label}`} onClick={onStopEditing}>
              <Check aria-hidden="true" size={15} />
            </button>
          ) : (
            <button type="button" className="card-icon-button" title={`Edit for ${spec.label}`} aria-label={`Edit the post for ${spec.label}`} onClick={onStartEditing}>
              <Pencil aria-hidden="true" size={14} />
            </button>
          )}
        </span>
      </header>

      <div className={`platform-card-body${!isEditing && showModeToggle ? ` is-${previewMode}` : ''}`}>
        {isEditing ? (
          <PaneEditor
            // Forked panes never remount on master edits; non-forked panes
            // reseed from the updated master via the version key.
            key={isForked ? `${spec.id}:fork` : `${spec.id}:${masterVersion}`}
            initialContent={document}
            ariaLabel={`${spec.label} post editor`}
            onChange={onPaneChange}
          />
        ) : (
          <p className="platform-card-text">
            {hasText ? (
              <>
                {displayText}
                {truncated ? (
                  <button type="button" className="platform-card-seemore" onClick={() => setExpanded((value) => !value)}>
                    {expanded ? ' less...' : ` ${spec.truncationLabel || 'more...'}`}
                  </button>
                ) : null}
              </>
            ) : (
              <span className="platform-card-placeholder">Your {spec.label} post will appear here.</span>
            )}
          </p>
        )}
      </div>

      {!isEditing ? <CardAttachments attachments={attachments} platformLabel={spec.label} /> : null}

      {render.warnings.length > 0 ? (
        <ul className="platform-card-warnings">
          {render.warnings.map((warning) => (
            <li key={warning.id} className="platform-card-warning">
              <AlertTriangle aria-hidden="true" size={14} />
              <span>{warning.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <CharacterMeter summary={render.summary} disclaimer={spec.disclaimer} />

      <footer className="platform-card-buttons">
        <button type="button" className="card-copy-button" disabled={!hasText} onClick={handleCopy}>
          <Copy aria-hidden="true" size={15} />
          {copyFlash === 'copied' ? 'Copied!' : copyFlash === 'error' ? 'Copy failed' : 'Copy'}
        </button>
        {spec.capabilities.openComposer ? (
          <button type="button" className="card-copy-button" disabled={!hasText} onClick={handleCopyAndOpen}>
            <ExternalLink aria-hidden="true" size={15} />
            Copy &amp; open
          </button>
        ) : null}
      </footer>
    </article>
  );
}

// Shared links shown on each card as a reference chip. The URL is already in the
// post text (and counted); image/video files live only in the Media tray (not on
// the previews) since a text copy can't carry them into a platform's composer.
function CardAttachments({ attachments, platformLabel }: { attachments: Attachment[]; platformLabel: string }) {
  const links = attachments.filter((attachment) => attachment.kind === 'link');

  if (links.length === 0) {
    return null;
  }

  return (
    <div className="card-attachments" aria-label={`Links for ${platformLabel}`}>
      {links.map((attachment) => (
        <a key={attachment.id} className="card-attachment is-link" href={attachment.url} target="_blank" rel="noreferrer noopener" title={attachment.url}>
          <Link2 aria-hidden="true" size={13} />
          <span className="card-attachment-name">{attachment.name}</span>
        </a>
      ))}
    </div>
  );
}

// Approximate a feed cutoff by trimming to the breakpoint's character estimate,
// backing off to the last word boundary so we don't cut mid-word.
function collapseText(text: string, config: TruncationConfig): string {
  const characters = Array.from(text);

  if (characters.length <= config.approximateCharacters) {
    return text;
  }

  let slice = characters.slice(0, config.approximateCharacters).join('');
  const lastSpace = slice.lastIndexOf(' ');

  if (lastSpace > config.approximateCharacters * 0.6) {
    slice = slice.slice(0, lastSpace);
  }

  return `${slice.trimEnd()}…`;
}
