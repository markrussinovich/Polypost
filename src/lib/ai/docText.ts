import { type EditorNode, exportText } from '../exportText';
import { flattenMentionTokens } from '../mentions';

// Editor document -> plain text the LLM reads (no styled Unicode, mentions flattened).
export function docToPlainText(doc: EditorNode | null | undefined): string {
  return flattenMentionTokens(exportText(doc, { unicodeStyling: false }));
}

// Plain text from the LLM -> a TipTap document. Single newlines within a run of
// text become hard breaks; each blank line becomes an empty paragraph (blank line
// <-> empty paragraph) so it round-trips back through the literal exporter.
export function plainTextToDoc(text: string): EditorNode {
  const normalized = text.replace(/\r\n?/g, '\n').trim();

  if (!normalized) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  const lines = normalized.split('\n');
  const content: EditorNode[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (!buffer.length) {
      return;
    }

    const inline: EditorNode[] = [];
    buffer.forEach((line, index) => {
      if (index > 0) {
        inline.push({ type: 'hardBreak' });
      }
      if (line) {
        inline.push({ type: 'text', text: line });
      }
    });
    content.push({ type: 'paragraph', content: inline });
    buffer = [];
  };

  let index = 0;
  while (index < lines.length) {
    if (lines[index].trim() === '') {
      let blanks = 0;
      while (index < lines.length && lines[index].trim() === '') {
        blanks += 1;
        index += 1;
      }
      flush();
      if (content.length > 0 && index < lines.length) {
        for (let i = 0; i < blanks; i += 1) {
          content.push({ type: 'paragraph' });
        }
      }
    } else {
      buffer.push(lines[index]);
      index += 1;
    }
  }
  flush();

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
