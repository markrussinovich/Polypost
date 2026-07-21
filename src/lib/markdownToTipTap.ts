import type { EditorMark, EditorNode } from './exportLinkedInText';

const HORIZONTAL_RULE_PATTERN = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const FENCED_CODE_PATTERN = /^\s{0,3}```/;
const HEADING_PATTERN = /^\s{0,3}(#{1,6})\s+(.+)$/;
const BULLET_PATTERN = /^(\s*)[-+*]\s+(.+)$/;
const ORDERED_PATTERN = /^(\s*)(\d+)\.\s+(.+)$/;
const BLOCKQUOTE_PATTERN = /^\s*>\s?(.*)$/;
const HTML_BLOCK_PATTERN = /^\s*<\/?[a-z][^>]*>\s*$/i;
const MARKDOWN_IMAGE_PATTERN = /^\s*!\[[^\]]*\]\([^)]+\)\s*$/;

export function looksLikeMarkdown(text: string): boolean {
  return /(^\s{0,3}(#{1,6}|[-+*]|\d+\.|>)\s+|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|~~[^~]+~~|__[^_]+__|^\s{0,3}[-*_]{3,}\s*$)/m.test(text);
}

export function plainTextToTipTap(text: string): EditorNode {
  const normalized = text.replace(/\r\n?/g, '\n').trim();

  if (!normalized) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  const lines = normalized.split('\n');
  const content: EditorNode[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length) {
      content.push(paragraphFromPlainText(buffer.join('\n')));
      buffer = [];
    }
  };

  let index = 0;
  while (index < lines.length) {
    if (lines[index].trim() === '') {
      // A run of blank lines becomes that many empty paragraphs (blank line <->
      // empty paragraph), preserving the author's spacing under the literal exporter.
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

export function markdownToTipTap(markdown: string): EditorNode {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const content: EditorNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      // Preserve blank lines as empty paragraphs (blank line <-> empty paragraph),
      // so the airy spacing in markdown/LLM output survives the literal exporter.
      // Leading and trailing blanks are skipped (the export trims them anyway).
      let blanks = 0;
      while (index < lines.length && !lines[index].trim()) {
        blanks += 1;
        index += 1;
      }

      if (content.length > 0 && index < lines.length) {
        for (let i = 0; i < blanks; i += 1) {
          content.push({ type: 'paragraph' });
        }
      }

      continue;
    }

    if (HTML_BLOCK_PATTERN.test(line) || MARKDOWN_IMAGE_PATTERN.test(line)) {
      index += 1;
      continue;
    }

    if (HORIZONTAL_RULE_PATTERN.test(line)) {
      content.push({ type: 'horizontalRule' });
      index += 1;
      continue;
    }

    if (FENCED_CODE_PATTERN.test(line)) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !FENCED_CODE_PATTERN.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      content.push(codeParagraph(codeLines));
      continue;
    }

    const headingMatch = line.match(HEADING_PATTERN);

    if (headingMatch) {
      content.push(heading(headingMatch[2], headingMatch[1].length));
      index += 1;
      continue;
    }

    if (parseListEntry(line)) {
      // Collect the whole run of list lines (bullet or ordered at any indent)
      // so an indented sublist of the other kind doesn't terminate the list.
      const entries: ListEntry[] = [];

      while (index < lines.length) {
        const entry = parseListEntry(lines[index]);

        if (!entry) {
          break;
        }

        entries.push(entry);
        index += 1;
      }

      const state = { index: 0 };

      while (state.index < entries.length) {
        content.push(buildList(entries, state));
      }

      continue;
    }

    const quoteMatch = line.match(BLOCKQUOTE_PATTERN);

    if (quoteMatch) {
      const quoteLines: string[] = [];

      while (index < lines.length) {
        const itemMatch = lines[index].match(BLOCKQUOTE_PATTERN);

        if (!itemMatch) {
          break;
        }

        quoteLines.push(itemMatch[1]);
        index += 1;
      }

      content.push({ type: 'blockquote', content: quoteLines.map((quoteLine) => paragraph(quoteLine)) });
      continue;
    }

    const paragraphLines = [line];
    index += 1;

    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    content.push(paragraph(paragraphLines.join(' ')));
  }

  return { type: 'doc', content };
}

function isBlockStart(line: string): boolean {
  return HORIZONTAL_RULE_PATTERN.test(line) || FENCED_CODE_PATTERN.test(line) || HEADING_PATTERN.test(line) || BULLET_PATTERN.test(line) || ORDERED_PATTERN.test(line) || BLOCKQUOTE_PATTERN.test(line) || HTML_BLOCK_PATTERN.test(line) || MARKDOWN_IMAGE_PATTERN.test(line);
}

interface ListEntry {
  kind: 'bullet' | 'ordered';
  indent: number;
  text: string;
  start?: number;
}

function parseListEntry(line: string): ListEntry | null {
  const bulletMatch = line.match(BULLET_PATTERN);

  if (bulletMatch) {
    return { kind: 'bullet', indent: indentWidth(bulletMatch[1]), text: bulletMatch[2] };
  }

  const orderedMatch = line.match(ORDERED_PATTERN);

  if (orderedMatch) {
    return { kind: 'ordered', indent: indentWidth(orderedMatch[1]), start: Number.parseInt(orderedMatch[2], 10), text: orderedMatch[3] };
  }

  return null;
}

function indentWidth(indent: string): number {
  return indent.replace(/\t/g, '  ').length;
}

// Builds one list from consecutive list entries, nesting by indentation:
// 2+ extra spaces open a sublist (attached to the previous item, matching the
// listItem > [paragraph, list] shape the exporter renders), a dedent below the
// list's own indent — or a same-level marker of the other kind — closes it.
function buildList(entries: ListEntry[], state: { index: number }): EditorNode {
  const first = entries[state.index];
  const items: EditorNode[] = [];

  while (state.index < entries.length) {
    const entry = entries[state.index];

    if (entry.indent >= first.indent + 2) {
      const nested = buildList(entries, state);
      const parent = items.at(-1);

      if (parent?.content) {
        parent.content.push(nested);
      } else {
        // An indented entry with no preceding item: keep it in a bare item.
        items.push({ type: 'listItem', content: [nested] });
      }

      continue;
    }

    if (entry.indent < first.indent || entry.kind !== first.kind) {
      break;
    }

    items.push(listItem(entry.text));
    state.index += 1;
  }

  return first.kind === 'ordered'
    ? { type: 'orderedList', attrs: { start: first.start ?? 1 }, content: items }
    : { type: 'bulletList', content: items };
}

function listItem(text: string): EditorNode {
  return { type: 'listItem', content: [paragraph(text)] };
}

function paragraph(text: string): EditorNode {
  return { type: 'paragraph', content: parseInlineMarks(text) };
}

function paragraphFromPlainText(text: string): EditorNode {
  const lines = text.split('\n');
  const content = lines.flatMap((line, index): EditorNode[] => {
    const nodes: EditorNode[] = index === 0 ? [] : [{ type: 'hardBreak' }];
    return [...nodes, textNode(line)];
  });

  return { type: 'paragraph', content };
}

function heading(text: string, depth: number): EditorNode {
  return { type: 'heading', attrs: { level: Math.min(depth + 1, 3) }, content: parseInlineMarks(text) };
}

function codeParagraph(lines: string[]): EditorNode {
  const content = lines.flatMap((line, index): EditorNode[] => {
    const nodes: EditorNode[] = index === 0 ? [] : [{ type: 'hardBreak' }];
    return [...nodes, textNode(line, [{ type: 'code' }])];
  });

  return { type: 'paragraph', content: content.length ? content : [textNode('', [{ type: 'code' }])] };
}

function parseInlineMarks(text: string): EditorNode[] {
  const nodes: EditorNode[] = [];
  const tokenPattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|~~[^~]+~~|__[^_]+__|\*[^*]+\*)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(textNode(text.slice(lastIndex, index)));
    }

    nodes.push(parseToken(match[0]));
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(textNode(text.slice(lastIndex)));
  }

  return nodes.length ? nodes : [textNode(text)];
}

function parseToken(token: string): EditorNode {
  const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

  if (linkMatch) {
    return textNode(linkMatch[1], [{ type: 'link', attrs: { href: normalizeHref(linkMatch[2]) } }]);
  }

  if (token.startsWith('***') && token.endsWith('***')) {
    return textNode(token.slice(3, -3), [{ type: 'bold' }, { type: 'italic' }]);
  }

  if (token.startsWith('**') && token.endsWith('**')) {
    return textNode(token.slice(2, -2), [{ type: 'bold' }]);
  }

  // CommonMark: __text__ is strong emphasis, same as **text** — LLM-generated
  // markdown (the AI author flow) relies on this. Underline has no markdown
  // syntax; it stays reachable through the editor toolbar.
  if (token.startsWith('__') && token.endsWith('__')) {
    return textNode(token.slice(2, -2), [{ type: 'bold' }]);
  }

  if (token.startsWith('~~') && token.endsWith('~~')) {
    return textNode(token.slice(2, -2), [{ type: 'strike' }]);
  }

  if (token.startsWith('`') && token.endsWith('`')) {
    return textNode(token.slice(1, -1), [{ type: 'code' }]);
  }

  if (token.startsWith('*') && token.endsWith('*')) {
    return textNode(token.slice(1, -1), [{ type: 'italic' }]);
  }

  return textNode(token);
}

function normalizeHref(href: string): string {
  const trimmed = href.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function textNode(text: string, marks?: EditorMark[]): EditorNode {
  return marks?.length ? { type: 'text', text, marks } : { type: 'text', text };
}
