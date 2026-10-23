import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Loader, Pencil, RotateCcw, Sparkles } from 'lucide-react';

import { copyLinkedInText, copyPlainText } from '../lib/clipboard';
import { exportText, type EditorNode } from '../lib/exportText';
import { lastUrlInText } from '../lib/linkPreview';
import { parseMentionSegments } from '../lib/mentions';
import { copyImageToClipboard, type Attachment, type LinkPreview } from '../lib/media';
import type { PlatformRender, PlatformSpec } from '../lib/platforms/types';
import { renderThreadPost, type PostThread } from '../lib/postThreads';
import { collapseToPreview, isTextTruncated, type PreviewMode } from '../lib/truncation';
import { CardImagePreview, CardLinkPreview } from './CardLinkPreview';
import { CharacterMeter } from './CharacterMeter';
import { PaneEditor } from './PaneEditor';
import { PLATFORM_ICONS } from './platformIcons';
import { ThreadEditor } from './ThreadEditor';

interface PlatformCardProps {
  spec: PlatformSpec;
  render: PlatformRender;
  // Document seeding the pane editor: the override when forked, else the master.
  document: EditorNode;
  isForked: boolean;
  // Holds an AI-fitted version (and isn't user-forked).
  isAiAdapted: boolean;
  // One selected image shown instead of URL previews, matching platform behavior.
  imageAttachment: Attachment | null;
  // Fetched metadata for URLs found in platform text, keyed by URL.
  linkPreviews: ReadonlyMap<string, LinkPreview>;
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
  thread?: PostThread;
  threadingNeeded?: boolean;
  threadingPaused?: boolean;
  onToggleThread?: (enabled: boolean) => void;
  onThreadChange?: (thread: PostThread) => void;
}

type CopyFlash = 'idle' | 'copied' | 'error';

const MODE_LABELS: Record<PreviewMode, string> = { desktop: 'Desktop', mobile: 'Mobile' };

export function PlatformCard({
  spec,
  render,
  document,
  isForked,
  isAiAdapted,
  imageAttachment,
  linkPreviews,
  isGenerating,
  aiReady,
  isEditing,
  masterVersion,
  onStartEditing,
  onStopEditing,
  onPaneChange,
  onResync,
  onFit,
  thread,
  threadingNeeded = false,
  threadingPaused = false,
  onToggleThread,
  onThreadChange,
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
  const showModeToggle = truncationModes.length > 1 && anyModeTruncates && !isEditing && !thread;

  const hasText = Boolean(render.text.trim());
  const showCollapsed = truncated && !expanded && activeCutoff !== null;
  const displayText = showCollapsed && activeCutoff ? collapseToPreview(render.text, activeCutoff) : render.text;
  const imagePreviewAttachment = spec.capabilities.imageAttachments ? imageAttachment : null;
  // The flattened mention strings present in this platform's text, so they can be
  // highlighted in the preview the same way the editor highlights @[Name] tokens.
  const mentionStrings = useMemo(() => collectMentionStrings(document, spec), [document, spec]);
  const previewUrl = useMemo(
    () => (!imagePreviewAttachment && spec.linkPreview ? lastUrlInText(render.text) : undefined),
    [imagePreviewAttachment, render.text, spec.linkPreview],
  );
  const cardStatus = thread
    ? thread.posts.some((_, index) => renderThreadPost(thread, index, spec).summary.status === 'over') ? 'over' : 'normal'
    : render.summary.status;

  // The pane editor's identity for this editing session. A non-forked pane
  // reseeds (remounts) when the master changes, but the first keystroke in it
  // forks the platform — and that transition must NOT change the key, or the
  // editor remounts mid-word and drops focus, the caret, and IME composition.
  const paneKeyRef = useRef<string | null>(null);
  const paneKey = isForked ? paneKeyRef.current ?? `${spec.id}:fork` : `${spec.id}:${masterVersion}`;
  paneKeyRef.current = isEditing ? paneKey : null;

  const [copyFlash, setCopyFlash] = useState<CopyFlash>('idle');
  const [imageCopyFlash, setImageCopyFlash] = useState<CopyFlash>('idle');
  const flashTimer = useRef<number | null>(null);
  const imageFlashTimer = useRef<number | null>(null);

  function flash(state: CopyFlash) {
    setCopyFlash(state);

    if (flashTimer.current) {
      window.clearTimeout(flashTimer.current);
    }

    flashTimer.current = window.setTimeout(() => setCopyFlash('idle'), 1800);
  }

  function flashImage(state: CopyFlash) {
    setImageCopyFlash(state);

    if (imageFlashTimer.current) {
      window.clearTimeout(imageFlashTimer.current);
    }

    imageFlashTimer.current = window.setTimeout(() => setImageCopyFlash('idle'), 1800);
  }

  async function handleCopyImage() {
    if (!imagePreviewAttachment) {
      return;
    }

    try {
      await copyImageToClipboard(imagePreviewAttachment);
      flashImage('copied');
    } catch {
      flashImage('error');
    }
  }

  async function handleCopy() {
    try {
      await copyPlatformText();
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
      await copyPlatformText();
      const composerWindow = window.open(composer.url(render.text), '_blank');

      if (composerWindow) {
        composerWindow.opener = null;
      }

      flash('copied');
    } catch {
      flash('error');
    }
  }

  function copyPlatformText() {
    return spec.id === 'linkedin' ? copyLinkedInText(render.text) : copyPlainText(render.text);
  }

  return (
    <article className={`platform-card is-${spec.id} is-${cardStatus}${isForked ? ' is-forked' : ''}${isAiAdapted ? ' is-ai' : ''}`} aria-label={`${spec.label} preview`}>
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
          {thread ? <span className="platform-card-badge">Thread</span> : null}
          {!isForked && isAiAdapted ? <span className="platform-card-badge is-ai">AI</span> : null}
          {isGenerating ? (
            <span className="platform-card-badge is-generating">
              <Loader aria-hidden="true" size={12} className="spin" /> Adapting…
            </span>
          ) : null}
        </span>
        <span className="platform-card-actions">
          {aiReady && !isEditing ? (
            <button type="button" className="card-icon-button card-ai-button" title={`Suggest AI changes for ${spec.label}`} aria-label={`Suggest AI changes for ${spec.label}`} disabled={isGenerating} onClick={onFit}>
              <Sparkles aria-hidden="true" size={15} />
            </button>
          ) : null}
          {isForked || isAiAdapted || thread ? (
            <button type="button" className="card-icon-button" title="Re-sync from master draft" aria-label={`Re-sync ${spec.label} from the master draft`} onClick={onResync}>
              <RotateCcw aria-hidden="true" size={15} />
            </button>
          ) : null}
          {!thread && (isEditing ? (
            <button type="button" className="card-icon-button is-done" title="Done editing" aria-label={`Done editing ${spec.label}`} onClick={onStopEditing}>
              <Check aria-hidden="true" size={15} />
            </button>
          ) : (
            <button type="button" className="card-icon-button" title={`Edit for ${spec.label}`} aria-label={`Edit the post for ${spec.label}`} onClick={onStartEditing}>
              <Pencil aria-hidden="true" size={14} />
            </button>
          ))}
        </span>
      </header>

      {spec.capabilities.threads && onToggleThread ? (
        <div className="post-thread-mode">
          <label className="field-row toggle-row">
            <input
              type="checkbox"
              role="switch"
              aria-label={`Split ${spec.label} into a thread`}
              checked={Boolean(thread)}
              disabled={threadingPaused || isEditing || (!thread && !threadingNeeded)}
              title={!thread && !threadingNeeded ? 'The original draft fits in a single post.' : undefined}
              onChange={(event) => onToggleThread(event.target.checked)}
            />
            Split into a thread
          </label>
          {thread ? (
            <strong aria-live="polite">{thread.posts.length} {thread.posts.length === 1 ? 'post' : 'posts'}</strong>
          ) : null}
        </div>
      ) : null}

      {thread && onThreadChange ? (
        <>
          <ThreadEditor spec={spec} thread={thread} onChange={onThreadChange} linkPreviews={linkPreviews} showLinkPreviews={!imagePreviewAttachment} />
          {imagePreviewAttachment ? (
            <>
              <CardImagePreview image={imagePreviewAttachment} spec={spec} />
              <footer className="platform-card-buttons">
                <button type="button" className="card-copy-button" onClick={handleCopyImage}>
                  <Copy aria-hidden="true" size={15} />
                  {imageCopyFlash === 'copied' ? 'Image copied!' : imageCopyFlash === 'error' ? 'Copy image failed' : 'Copy image'}
                </button>
              </footer>
            </>
          ) : null}
        </>
      ) : (
        <>
          <div className={`platform-card-body${!isEditing && showModeToggle ? ` is-${previewMode}` : ''}`}>
            {isEditing ? (
              <PaneEditor
                // Forked panes never remount on master edits; non-forked panes
                // reseed from the updated master via the version key.
                key={paneKey}
                initialContent={document}
                ariaLabel={`${spec.label} post editor`}
                onChange={onPaneChange}
              />
            ) : (
              <p className="platform-card-text" onDoubleClick={onStartEditing}>
                {hasText ? (
                  <>
                    {renderMentionText(displayText, mentionStrings)}
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

          {!isEditing && imagePreviewAttachment ? <CardImagePreview image={imagePreviewAttachment} spec={spec} /> : null}
          {!isEditing && !imagePreviewAttachment && previewUrl ? <CardLinkPreview url={previewUrl} preview={linkPreviews.get(previewUrl)} spec={spec} /> : null}

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
            {imagePreviewAttachment ? (
              <button type="button" className="card-copy-button" onClick={handleCopyImage}>
                <Copy aria-hidden="true" size={15} />
                {imageCopyFlash === 'copied' ? 'Image copied!' : imageCopyFlash === 'error' ? 'Copy image failed' : 'Copy image'}
              </button>
            ) : null}
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
        </>
      )}
    </article>
  );
}

// The flattened display form of each @[Name] mention in this platform's text
// (e.g. "@Scott Hanselman" on LinkedIn, "@ScottHanselman" elsewhere).
function collectMentionStrings(doc: EditorNode, spec: PlatformSpec): string[] {
  const exported = exportText(doc, { unicodeStyling: spec.allowUnicodeStyling });
  const collapse = !(spec.keepMentionSpaces ?? false);
  const strings = parseMentionSegments(exported)
    .filter((segment): segment is { kind: 'mention'; name: string } => segment.kind === 'mention')
    .map((segment) => `@${collapse ? segment.name.replace(/\s+/g, '') : segment.name}`);
  return [...new Set(strings)];
}

// Splits the displayed text on the known mention strings and wraps each in a
// highlighted span (the rest renders as plain text).
function renderMentionText(text: string, mentions: string[]) {
  if (mentions.length === 0 || !text) {
    return text;
  }

  const escaped = [...mentions]
    .sort((a, b) => b.length - a.length)
    .map((mention) => mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'g');
  const mentionSet = new Set(mentions);

  return text.split(pattern).map((part, index) =>
    mentionSet.has(part) ? (
      <span key={index} className="mention-ref">{part}</span>
    ) : (
      part
    ),
  );
}
