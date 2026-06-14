import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Code2,
  FileUp,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { getAcceptedDocumentTypes } from '../lib/importDocument';
import { EmojiPicker } from './EmojiPicker';
import { PromptDialog } from './PromptDialog';

interface ToolbarProps {
  editor: Editor | null;
  onImportFile: (file: File) => void | Promise<void>;
  onReset: () => void;
}

interface ToolButtonProps {
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function Toolbar({ editor, onImportFile, onReset }: ToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInitial, setLinkInitial] = useState('https://');

  function run(command: () => boolean) {
    if (!editor) {
      return;
    }

    command();
  }

  function openLinkDialog() {
    if (!editor) {
      return;
    }

    const existingHref = editor.getAttributes('link').href as string | undefined;
    setLinkInitial(existingHref ?? 'https://');
    setLinkOpen(true);
  }

  function applyLink(value: string) {
    setLinkOpen(false);

    if (!editor) {
      return;
    }

    const trimmed = value.trim();

    if (!trimmed) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    // With no text selected, setLink has nothing to mark and inserts nothing.
    // Insert the URL itself as linked text, then drop the mark + add a space so
    // typing continues unlinked.
    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .unsetMark('link')
        .insertContent(' ')
        .run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }

  function insertEmoji(emoji: string) {
    if (!editor) {
      return;
    }

    editor.chain().focus().insertContent(emoji).run();
  }

  function handleImportChange(event: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    if (file) {
      void onImportFile(file);
    }

    event.currentTarget.value = '';
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting toolbar">
      <div className="toolbar-row toolbar-row-main">
        <div className="toolbar-group" aria-label="History">
          <ToolButton
            label="Undo"
            shortcut="Ctrl+Z"
            icon={Undo2}
            disabled={!editor?.can().undo()}
            onClick={() => run(() => editor!.chain().focus().undo().run())}
          />
          <ToolButton
            label="Redo"
            shortcut="Ctrl+Y"
            icon={Redo2}
            disabled={!editor?.can().redo()}
            onClick={() => run(() => editor!.chain().focus().redo().run())}
          />
        </div>

        <div className="toolbar-group" aria-label="Inline styles">
          <ToolButton
            label="Bold"
            shortcut="Ctrl+B"
            icon={Bold}
            active={editor?.isActive('bold') ?? false}
            disabled={!editor}
            onClick={() => run(() => editor!.chain().focus().toggleBold().run())}
          />
          <ToolButton
            label="Italic"
            shortcut="Ctrl+I"
            icon={Italic}
            active={editor?.isActive('italic') ?? false}
            disabled={!editor}
            onClick={() => run(() => editor!.chain().focus().toggleItalic().run())}
          />
          <ToolButton
            label="Underline"
            shortcut="Ctrl+U"
            icon={Underline}
            active={editor?.isActive('underline') ?? false}
            disabled={!editor}
            onClick={() => run(() => editor!.chain().focus().toggleUnderline().run())}
          />
          <ToolButton
            label="Code"
            icon={Code2}
            active={editor?.isActive('code') ?? false}
            disabled={!editor}
            onClick={() => run(() => editor!.chain().focus().toggleCode().run())}
          />
          <ToolButton
            label="Strikethrough"
            icon={Strikethrough}
            active={editor?.isActive('strike') ?? false}
            disabled={!editor}
            onClick={() => run(() => editor!.chain().focus().toggleStrike().run())}
          />
          <ToolButton label="Link" icon={Link2} active={editor?.isActive('link') ?? false} disabled={!editor} onClick={openLinkDialog} />
        </div>

        <div className="toolbar-group" aria-label="Lists">
          <ToolButton
            label="Bulleted list"
            icon={List}
            active={editor?.isActive('bulletList') ?? false}
            disabled={!editor}
            onClick={() => run(() => editor!.chain().focus().toggleBulletList().run())}
          />
          <ToolButton
            label="Numbered list"
            icon={ListOrdered}
            active={editor?.isActive('orderedList') ?? false}
            disabled={!editor}
            onClick={() => run(() => editor!.chain().focus().toggleOrderedList().run())}
          />
          <ToolButton
            label="Indent list item"
            icon={IndentIncrease}
            disabled={!editor?.can().sinkListItem('listItem')}
            onClick={() => run(() => editor!.chain().focus().sinkListItem('listItem').run())}
          />
          <ToolButton
            label="Outdent list item"
            icon={IndentDecrease}
            disabled={!editor?.can().liftListItem('listItem')}
            onClick={() => run(() => editor!.chain().focus().liftListItem('listItem').run())}
          />
        </div>

        <div className="toolbar-group" aria-label="Blocks">
          <ToolButton
            label="Blockquote"
            icon={Quote}
            active={editor?.isActive('blockquote') ?? false}
            disabled={!editor}
            onClick={() => run(() => editor!.chain().focus().toggleBlockquote().run())}
          />
          <ToolButton
            label="Horizontal divider"
            icon={Minus}
            disabled={!editor?.can().setHorizontalRule()}
            onClick={() => run(() => editor!.chain().focus().setHorizontalRule().run())}
          />
        </div>

        <div className="toolbar-group" aria-label="Insert">
          <EmojiPicker disabled={!editor} onSelect={insertEmoji} />
        </div>

        <div className="toolbar-group toolbar-group-push" aria-label="Draft actions">
          <div className={`import-button${!editor ? ' is-disabled' : ''}`} title="Upload text, Markdown, or Word document">
            <FileUp aria-hidden="true" size={15} strokeWidth={2.2} />
            <input
              type="file"
              aria-label="Upload text, Markdown, or Word document"
              accept={getAcceptedDocumentTypes()}
              disabled={!editor}
              onInput={handleImportChange}
              onChange={handleImportChange}
            />
          </div>
          <ToolButton label="Reset draft" icon={Trash2} disabled={!editor} onClick={onReset} />
        </div>
      </div>
      {linkOpen ? (
        <PromptDialog
          title="Add or edit link"
          label="URL for the selected text (leave empty to remove the link)"
          initialValue={linkInitial}
          placeholder="https://example.com"
          submitLabel="Apply link"
          onSubmit={applyLink}
          onCancel={() => setLinkOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ToolButton({ label, shortcut, icon: Icon, active, disabled, onClick }: ToolButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  const buttonContent = <Icon aria-hidden="true" size={15} strokeWidth={2.2} />;

  if (active === true) {
    return (
      <button
        type="button"
        className="tool-button is-active"
        aria-label={title}
        aria-pressed="true"
        disabled={disabled}
        title={title}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
      >
        {buttonContent}
      </button>
    );
  }

  if (active === false) {
    return (
      <button
        type="button"
        className="tool-button"
        aria-label={title}
        aria-pressed="false"
        disabled={disabled}
        title={title}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
      >
        {buttonContent}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="tool-button"
      aria-label={title}
      disabled={disabled}
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {buttonContent}
    </button>
  );
}