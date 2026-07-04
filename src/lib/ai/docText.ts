import { type EditorMark, type EditorNode, exportText } from '../exportText';

// Editor document -> plain text the LLM reads (no styled Unicode). Mention tokens
// are kept verbatim as @[Name] (NOT flattened to @Name) so the model can preserve
// them through a rewrite; the prompts instruct it to leave them exactly as written.
export function docToPlainText(doc: EditorNode | null | undefined): string {
  return exportText(doc, { unicodeStyling: false });
}

// Editor document -> Markdown the LLM reads for styling-capable platforms, so the
// author's bold/italic/links/lists survive the rewrite instead of being flattened
// to plain text (the model can only preserve formatting it can actually see). This
// is the inverse of markdownToTipTap, which parses the model's Markdown reply back
// into a document. Mention tokens stay verbatim as @[Name].
export function docToMarkdown(doc: EditorNode | null | undefined): string {
  if (!doc) {
    return '';
  }

  const blocks = doc.type === 'doc' ? doc.content ?? [] : [doc];
  return serializeBlocks(blocks).replace(/\n{3,}/g, '\n\n').trim();
}

function serializeBlocks(nodes: EditorNode[]): string {
  return nodes.map((node) => serializeBlock(node)).join('\n\n');
}

function serializeBlock(node: EditorNode): string {
  switch (node.type) {
    case 'doc':
      return serializeBlocks(node.content ?? []);
    case 'paragraph':
      return serializeInline(node.content ?? []);
    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 2;
      // markdownToTipTap maps '#' -> level 2 and '##'/'###' -> level 3, so one
      // fewer '#' than the level round-trips back to the same heading.
      return `${'#'.repeat(Math.max(1, level - 1))} ${serializeInline(node.content ?? [])}`;
    }
    case 'blockquote':
      return (node.content ?? [])
        .map((child) => `> ${serializeInline(child.content ?? [])}`)
        .join('\n');
    case 'horizontalRule':
      return '---';
    case 'bulletList':
      return (node.content ?? [])
        .map((item) => `- ${serializeInline(firstParagraph(item))}`)
        .join('\n');
    case 'orderedList': {
      const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
      return (node.content ?? [])
        .map((item, index) => `${start + index}. ${serializeInline(firstParagraph(item))}`)
        .join('\n');
    }
    default:
      return node.content ? serializeBlocks(node.content) : '';
  }
}

function firstParagraph(listItem: EditorNode): EditorNode[] {
  const paragraph = (listItem.content ?? []).find((child) => child.type === 'paragraph');
  return paragraph?.content ?? [];
}

function serializeInline(nodes: EditorNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') {
        return '\n';
      }
      if (node.type === 'text') {
        return wrapMarks(node.text ?? '', node.marks ?? []);
      }
      return node.content ? serializeInline(node.content) : '';
    })
    .join('');
}

// markdownToTipTap parses a single mark per text token, so emit one delimiter by
// priority rather than nesting (which it can't read back). Links carry an href; a
// link whose visible text already equals the href stays bare so it round-trips.
function wrapMarks(text: string, marks: EditorMark[]): string {
  if (!text) {
    return '';
  }

  const has = (type: string) => marks.some((mark) => mark.type === type);
  const link = marks.find((mark) => mark.type === 'link');
  const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : '';

  if (has('code')) {
    return `\`${text}\``;
  }
  if (href) {
    return text.trim() === href ? href : `[${text}](${href})`;
  }
  if (has('bold')) {
    return `**${text}**`;
  }
  if (has('underline')) {
    return `__${text}__`;
  }
  if (has('strike')) {
    return `~~${text}~~`;
  }
  if (has('italic')) {
    return `*${text}*`;
  }

  return text;
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
