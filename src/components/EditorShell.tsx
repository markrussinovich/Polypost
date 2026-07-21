import { useState } from 'react';
import { generateJSON } from '@tiptap/core';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';

import { APP_NAME } from '../lib/constants';
import { editorExtensions, handleEditorPaste } from '../lib/editorConfig';
import type { EditorNode } from '../lib/exportText';
import { importDocumentFile } from '../lib/importDocument';
import { isFeedCutoffLikely, type FeedPreviewMode } from '../lib/feedPreview';
import { Toolbar } from './Toolbar';

interface EditorShellProps {
  initialContent: EditorNode;
  onDocumentChange: (document: EditorNode) => void;
  onReplaceDocument: (document: EditorNode) => void;
  onReset: () => void;
  // LinkedIn feed preview is opt-in: only rendered when a consumer wires the
  // mode handler (the browser extension does). The general web editor omits
  // these so it stays a plain formatting editor; appearance lives in the cards.
  exportedText?: string;
  feedPreviewMode?: FeedPreviewMode | null;
  showFeedCutoff?: boolean;
  onFeedCutoffChange?: (showFeedCutoff: boolean) => void;
  onFeedPreviewModeChange?: (mode: FeedPreviewMode | null) => void;
}

export function EditorShell({
  initialContent,
  onDocumentChange,
  onReplaceDocument,
  onReset,
  exportedText = '',
  feedPreviewMode = null,
  showFeedCutoff = false,
  onFeedCutoffChange,
  onFeedPreviewModeChange,
}: EditorShellProps) {
  const showFeedControls = Boolean(onFeedPreviewModeChange);
  const [isDragActive, setIsDragActive] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const editor = useEditor({
    extensions: editorExtensions,
    content: initialContent as JSONContent,
    editorProps: {
      attributes: {
        'aria-label': 'Post draft editor',
        class: 'rich-editor-content',
      },
    },
    immediatelyRender: false,
    onCreate({ editor: currentEditor }) {
      // Handle paste on the editor DOM directly. ProseMirror's editorProps
      // paste hooks proved unreliable in the extension's mount, so a
      // capture-phase listener guarantees our sanitization is applied.
      currentEditor.view.dom.addEventListener('paste', (event) => handleEditorPaste(currentEditor, event), true);
      onDocumentChange(currentEditor.getJSON() as EditorNode);
    },
    onUpdate({ editor: currentEditor }) {
      onDocumentChange(currentEditor.getJSON() as EditorNode);
    },
  });

  async function handleImportFile(file: File) {
    if (!editor) {
      return;
    }

    setImportError(null);

    try {
      const importedDocument = await importDocumentFile(file);
      const nextDocument = importedDocument.format === 'html'
        ? (generateJSON(importedDocument.html, editorExtensions) as EditorNode)
        : (editor.schema.nodeFromJSON(importedDocument.document).toJSON() as EditorNode);

      onReplaceDocument(nextDocument);
    } catch (error) {
      // importDocumentFile throws user-facing messages (e.g. legacy .doc advice).
      setImportError(error instanceof Error ? error.message : 'The file could not be imported.');
    }
  }

  function handleEditorDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragActive(true);
  }

  function handleEditorDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragActive(false);
    }
  }

  function handleEditorDrop(event: React.DragEvent<HTMLDivElement>) {
    const file = event.dataTransfer.files[0];

    if (!file) {
      return;
    }

    event.preventDefault();
    setIsDragActive(false);
    void handleImportFile(file);
  }

  function handleEditorMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (!(target instanceof HTMLElement) || !editor) {
      return;
    }

    const editorElement = event.currentTarget.querySelector<HTMLElement>('.rich-editor-content');

    if (target.closest('a, button, input, textarea, select')) {
      return;
    }

    if (target === event.currentTarget || target === editorElement) {
      editor.commands.focus('end');
    }
  }

  return (
    <div className="editor-shell">
      <Toolbar editor={editor} onImportFile={handleImportFile} onReset={onReset} />
      {importError ? <p className="inline-alert panel-alert" role="alert">{importError}</p> : null}
      {showFeedControls ? (
        <div className="editor-preview-controls" aria-label="Editor preview width">
          <span>View</span>
          <PreviewModeButton active={feedPreviewMode === null} label="Editor" onClick={() => onFeedPreviewModeChange?.(null)} />
          <PreviewModeButton active={feedPreviewMode === 'desktop'} label="Desktop" onClick={() => onFeedPreviewModeChange?.('desktop')} />
          <PreviewModeButton active={feedPreviewMode === 'mobile'} label="Mobile" onClick={() => onFeedPreviewModeChange?.('mobile')} />
          <PreviewModeButton
            active={Boolean(feedPreviewMode && showFeedCutoff)}
            className="more-preview-toggle"
            disabled={!feedPreviewMode}
            label="...more"
            onClick={() => onFeedCutoffChange?.(!showFeedCutoff)}
          />
        </div>
      ) : null}
      <div
        className={`editor-frame${showFeedControls && feedPreviewMode ? ` is-feed-preview is-${feedPreviewMode}` : ''}${isDragActive ? ' is-drag-active' : ''}`}
        onDragOver={handleEditorDragOver}
        onDragLeave={handleEditorDragLeave}
        onDrop={handleEditorDrop}
        onMouseDown={handleEditorMouseDown}
      >
        {showFeedControls && feedPreviewMode ? (
          <div className="feed-editor-card">
            <FeedEditorHeader />
            {showFeedCutoff ? <FeedCutoffPreview mode={feedPreviewMode} text={exportedText} /> : <EditorContent editor={editor} />}
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
    </div>
  );
}

interface PreviewModeButtonProps {
  active: boolean;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

function PreviewModeButton({ active, className = '', disabled = false, label, onClick }: PreviewModeButtonProps) {
  const buttonClassName = `preview-toggle${className ? ` ${className}` : ''}`;

  if (active) {
    return (
      <button type="button" className={`${buttonClassName} is-active`} aria-pressed="true" disabled={disabled} onClick={onClick}>
        {label}
      </button>
    );
  }

  return (
    <button type="button" className={buttonClassName} aria-pressed="false" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

interface FeedCutoffPreviewProps {
  mode: FeedPreviewMode;
  text: string;
}

function FeedCutoffPreview({ mode, text }: FeedCutoffPreviewProps) {
  const hasText = Boolean(text.trim());
  const isTruncated = isFeedCutoffLikely(text, mode);

  return (
    <div className={`feed-cutoff-preview is-${mode}${isTruncated ? ' is-truncated' : ''}`} aria-label="Estimated collapsed LinkedIn feed preview">
      <p className="feed-cutoff-text">
        {hasText ? text : 'Your LinkedIn-ready text will appear here.'}
      </p>
      {isTruncated ? <span className="feed-see-more" aria-hidden="true">...more</span> : null}
    </div>
  );
}

function FeedEditorHeader() {
  return (
    <div className="feed-preview-header">
      <div className="feed-avatar" aria-hidden="true">in</div>
      <div>
        <p className="feed-author">{APP_NAME}</p>
        <p className="feed-meta">Now · Public</p>
      </div>
    </div>
  );
}