import { transformAroundMentionTokens } from './mentions';
import { type UnicodeStyleOptions, styleText } from './unicodeStyles';

const HORIZONTAL_RULE_TEXT = '────────';
const INDENT_TEXT = '      ';

export interface EditorMark {
  type?: string;
  attrs?: Record<string, unknown>;
}

export interface EditorNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: EditorMark[];
  content?: EditorNode[];
}

export interface ExportOptions {
  // When false, text is emitted raw instead of mapped to styled Unicode
  // (math-alphanumeric bold/italic, combining underline/strike). LinkedIn opts
  // in; platforms where styled Unicode hurts reach/accessibility opt out.
  unicodeStyling: boolean;
}

export function exportText(document: EditorNode | null | undefined, options: ExportOptions): string {
  if (!document) {
    return '';
  }

  const blocks = document.type === 'doc' ? document.content ?? [] : [document];
  return trimPlainWhitespace(renderBlocks(blocks, options));
}

function renderBlocks(nodes: EditorNode[], options: ExportOptions): string {
  let output = '';
  let previous: EditorNode | null = null;
  // Empty paragraphs are blank lines the author inserted for spacing. Rather than
  // dropping them, each one adds an extra newline between the surrounding content
  // so the spacing shows in the preview. (Leading/trailing blank lines are still
  // trimmed by trimPlainWhitespace.)
  let pendingBlankLines = 0;

  for (const node of nodes) {
    const text = renderBlock(node, options);

    if (text.length === 0) {
      if (previous !== null && node.type === 'paragraph') {
        pendingBlankLines += 1;
      }
      continue;
    }

    if (previous === null) {
      output = text;
    } else {
      // Every block boundary is a single newline; blank lines come only from the
      // author's empty paragraphs (counted above). This mirrors LinkedIn's
      // composer, where newlines map 1:1 instead of auto-spacing paragraphs.
      output += '\n' + '\n'.repeat(pendingBlankLines) + text;
    }

    previous = node;
    pendingBlankLines = 0;
  }

  return output;
}

function trimPlainWhitespace(text: string): string {
  return text.replace(/^[ \t\r\n\f\v]+|[ \t\r\n\f\v]+$/g, '');
}

function renderBlock(node: EditorNode, options: ExportOptions): string {
  switch (node.type) {
    case 'doc':
      return renderBlocks(node.content ?? [], options);
    case 'paragraph':
      return renderInline(node.content ?? [], options);
    case 'heading':
      return renderInline(node.content ?? [], options, [{ type: 'bold' }]);
    case 'blockquote':
      return renderBlockquote(node, options);
    case 'horizontalRule':
      return HORIZONTAL_RULE_TEXT;
    case 'bulletList':
      return renderList(node, 'bullet', options);
    case 'orderedList':
      return renderList(node, 'ordered', options);
    case 'listItem':
      return renderListItemLines(node, options).join('\n');
    case 'text':
      return renderTextNode(node, options);
    case 'hardBreak':
      return '\n';
    default:
      return node.content ? renderBlocks(node.content, options) : '';
  }
}

function renderInline(nodes: EditorNode[], options: ExportOptions, inheritedMarks: EditorMark[] = []): string {
  return nodes.map((node) => renderInlineNode(node, options, inheritedMarks)).join('');
}

function renderInlineNode(node: EditorNode, options: ExportOptions, inheritedMarks: EditorMark[]): string {
  if (node.type === 'text') {
    return renderTextNode(node, options, inheritedMarks);
  }

  if (node.type === 'hardBreak') {
    return '\n';
  }

  return node.content ? renderInline(node.content, options, inheritedMarks) : '';
}

function renderTextNode(node: EditorNode, options: ExportOptions, inheritedMarks: EditorMark[] = []): string {
  const text = node.text ?? '';
  const marks = [...inheritedMarks, ...(node.marks ?? [])];
  const href = getLinkHref(marks);
  // Mention tokens stay unstyled: their text feeds the platform typeahead
  // lookup, and platforms render mentions without styling anyway.
  const styledText = options.unicodeStyling
    ? transformAroundMentionTokens(text, (chunk) => styleText(chunk, getStyleOptions(marks)))
    : text;

  if (!href) {
    return styledText;
  }

  if (text.trim() === href) {
    return href;
  }

  return `${styledText} (${href})`;
}

function renderBlockquote(node: EditorNode, options: ExportOptions): string {
  return renderBlocks(node.content ?? [], options)
    .split('\n')
    .map((line) => (line.trim() ? `${INDENT_TEXT}${line}` : ''))
    .join('\n');
}

function renderList(node: EditorNode, kind: 'bullet' | 'ordered', options: ExportOptions, depth = 0): string {
  let orderedIndex = getOrderedStart(node);
  const lines: string[] = [];
  const indent = INDENT_TEXT.repeat(depth);

  for (const item of node.content ?? []) {
    if (item.type !== 'listItem') {
      continue;
    }

    const itemLines = renderListItemLines(item, options, depth);
    const firstLine = itemLines.shift() ?? '';
    const prefix = kind === 'bullet' ? `${indent}• ` : `${indent}${orderedIndex}. `;
    lines.push(`${prefix}${firstLine}`.trimEnd());
    lines.push(...itemLines);
    orderedIndex += 1;
  }

  return lines.join('\n');
}

function renderListItemLines(node: EditorNode, options: ExportOptions, depth = 0): string[] {
  const leadParts: string[] = [];
  const extraLines: string[] = [];

  for (const child of node.content ?? []) {
    if (child.type === 'paragraph' || child.type === 'heading') {
      const text = renderInline(child.content ?? [], options).trim();

      if (text) {
        leadParts.push(text);
      }
    } else if (child.type === 'bulletList') {
      extraLines.push(...renderList(child, 'bullet', options, depth + 1).split('\n').filter(Boolean));
    } else if (child.type === 'orderedList') {
      extraLines.push(...renderList(child, 'ordered', options, depth + 1).split('\n').filter(Boolean));
    } else {
      const text = renderBlock(child, options).trim();

      if (text) {
        leadParts.push(text);
      }
    }
  }

  return [leadParts.join(' '), ...extraLines].filter((line) => line.length > 0);
}

function getStyleOptions(marks: EditorMark[]): UnicodeStyleOptions {
  return {
    bold: marks.some((mark) => mark.type === 'bold'),
    italic: marks.some((mark) => mark.type === 'italic'),
    code: marks.some((mark) => mark.type === 'code'),
    strike: marks.some((mark) => mark.type === 'strike'),
    underline: marks.some((mark) => mark.type === 'underline'),
  };
}

function getLinkHref(marks: EditorMark[]): string | null {
  const link = marks.find((mark) => mark.type === 'link');
  const href = link?.attrs?.href;

  return typeof href === 'string' && href.trim() ? href.trim() : null;
}

function getOrderedStart(node: EditorNode): number {
  const start = node.attrs?.start;

  return typeof start === 'number' && Number.isFinite(start) ? start : 1;
}
