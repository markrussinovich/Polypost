import { useState } from 'react';
import { generateJSON } from '@tiptap/core';
import CharacterCount from '@tiptap/extension-character-count';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

import type { EditorNode } from '../lib/exportLinkedInText';
import { importDocumentFile } from '../lib/importDocument';
import { looksLikeMarkdown, markdownToTipTap } from '../lib/markdownToTipTap';
import { sanitizePastedHTML } from '../lib/pastedHtml';
import { isFeedCutoffLikely, type FeedPreviewMode } from '../lib/feedPreview';
import { Toolbar } from './Toolbar';

interface EditorShellProps {
  exportedText: string;
  feedPreviewMode: FeedPreviewMode | null;
  initialContent: EditorNode;
  showFeedCutoff: boolean;
  onFeedCutoffChange: (showFeedCutoff: boolean) => void;
  onFeedPreviewModeChange: (mode: FeedPreviewMode | null) => void;
  onDocumentChange: (document: EditorNode) => void;
  onReplaceDocument: (document: EditorNode) => void;
  onReset: () => void;
}

const extensions = [
  StarterKit.configure({
    codeBlock: false,
    heading: {
      levels: [2, 3],
    },
  }),
  Underline,
  Link.configure({
    autolink: true,
    defaultProtocol: 'https',
    openOnClick: true,
    HTMLAttributes: {
      target: '_blank',
      rel: 'noopener noreferrer nofollow',
      title: 'Click to open. Use the Link toolbar button to edit.',
    },
  }),
  Placeholder.configure({
    placeholder: 'Paste or write your LinkedIn post draft...',
  }),
  CharacterCount,
];

// Sanitizes pasted content before it reaches the editor. Markdown-looking plain
// text becomes formatted content; HTML (e.g. Word/Office) is run through the
// sanitizer to strip empty paragraphs and Office noise. Runs in the capture
// phase and stops the event so ProseMirror's default paste does not also fire.
function handleEditorPaste(editor: Editor, event: ClipboardEvent) {
  const plainText = event.clipboardData?.getData('text/plain') ?? '';
  const html = event.clipboardData?.getData('text/html') ?? '';

  if (plainText && looksLikeMarkdown(plainText)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    editor.commands.insertContent(markdownToTipTap(plainText).content ?? []);
    return;
  }

  if (html.trim()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    editor.commands.insertContent(sanitizePastedHTML(html));
  }
}

export function EditorShell({
  exportedText,
  feedPreviewMode,
  initialContent,
  showFeedCutoff,
  onFeedCutoffChange,
  onDocumentChange,
  onFeedPreviewModeChange,
  onReplaceDocument,
  onReset,
}: EditorShellProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const editor = useEditor({
    extensions,
    content: initialContent as JSONContent,
    editorProps: {
      attributes: {
        'aria-label': 'LinkedIn post draft editor',
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

    try {
      const importedDocument = await importDocumentFile(file);
      const nextDocument = importedDocument.format === 'html'
        ? (generateJSON(importedDocument.html, extensions) as EditorNode)
        : (editor.schema.nodeFromJSON(importedDocument.document).toJSON() as EditorNode);

      onReplaceDocument(nextDocument);
    } catch (error) {
      console.error(error);
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
      <div className="editor-preview-controls" aria-label="Editor preview width">
        <span>View</span>
        <PreviewModeButton active={feedPreviewMode === null} label="Editor" onClick={() => onFeedPreviewModeChange(null)} />
        <PreviewModeButton active={feedPreviewMode === 'desktop'} label="Desktop" onClick={() => onFeedPreviewModeChange('desktop')} />
        <PreviewModeButton active={feedPreviewMode === 'mobile'} label="Mobile" onClick={() => onFeedPreviewModeChange('mobile')} />
        <PreviewModeButton
          active={Boolean(feedPreviewMode && showFeedCutoff)}
          className="more-preview-toggle"
          disabled={!feedPreviewMode}
          label="...more"
          onClick={() => onFeedCutoffChange(!showFeedCutoff)}
        />
      </div>
      <div
        className={`editor-frame${feedPreviewMode ? ` is-feed-preview is-${feedPreviewMode}` : ''}${isDragActive ? ' is-drag-active' : ''}`}
        onDragOver={handleEditorDragOver}
        onDragLeave={handleEditorDragLeave}
        onDrop={handleEditorDrop}
        onMouseDown={handleEditorMouseDown}
      >
        {feedPreviewMode ? (
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
        <p className="feed-author">LinkedIn Post Formatter</p>
        <p className="feed-meta">Now · Public</p>
      </div>
    </div>
  );
}