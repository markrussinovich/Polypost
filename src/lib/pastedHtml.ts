const REMOVED_SELECTORS = 'style, script, meta, link, xml, img, table';
const EMPTY_BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, div';

export function sanitizePastedHTML(html: string): string {
  if (typeof document === 'undefined') {
    return fallbackSanitizePastedHTML(html);
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  removeComments(template.content);
  template.content.querySelectorAll(REMOVED_SELECTORS).forEach((element) => element.remove());
  removeOfficeNamespacedElements(template.content);
  normalizeWordLists(template.content);

  template.content.querySelectorAll('*').forEach((element) => {
    applySemanticMarks(element);
    stripNoisyAttributes(element);
  });

  removeEmptyBlocks(template.content);

  // Trim leading/trailing whitespace: Word wraps content in <html>/<body> and
  // the whitespace between those tags survives as edge text, which ProseMirror
  // would turn into empty paragraphs at the start/end of the paste.
  return template.innerHTML.trim();
}

// Word/Office paste wraps content in namespaced elements (o:p, w:*, v:*) that are
// empty or hold only a non-breaking space. Left in place they become empty
// paragraphs — i.e. lots of extra blank lines. Drop them entirely.
function removeOfficeNamespacedElements(root: DocumentFragment) {
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (element.tagName.includes(':')) {
      element.remove();
    }
  }
}

// After cleanup, remove block elements that carry no real content (empty Word
// spacer paragraphs, or blocks left holding only whitespace / line breaks).
// Paragraph spacing in the editor handles separation, so dropping these is what
// stops pasted Word documents from gaining extra newlines.
function removeEmptyBlocks(root: DocumentFragment) {
  // Innermost-first so an emptied wrapper is removed after its empty children.
  const blocks = Array.from(root.querySelectorAll(EMPTY_BLOCK_SELECTOR)).reverse();

  for (const block of blocks) {
    if (block.querySelector('img, hr, li')) {
      continue;
    }

    const text = (block.textContent ?? '').replace(/ /g, ' ').trim();

    if (!text) {
      block.remove();
    }
  }
}

function removeComments(root: DocumentFragment) {
  const comments = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const nodes: Comment[] = [];

  while (comments.nextNode()) {
    nodes.push(comments.currentNode as Comment);
  }

  nodes.forEach((node) => node.remove());
}

function normalizeWordLists(root: DocumentFragment | Element) {
  normalizeListChildren(root);

  root.querySelectorAll('div, section, article').forEach((container) => normalizeListChildren(container));
}

function normalizeListChildren(parent: DocumentFragment | Element) {
  let currentList: HTMLOListElement | HTMLUListElement | null = null;
  let currentKind: 'ordered' | 'bullet' | null = null;

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) {
      continue;
    }

    if (!(child instanceof HTMLElement) || !isWordListBlock(child)) {
      currentList = null;
      currentKind = null;
      continue;
    }

    const kind = getWordListKind(child);

    if (!currentList || currentKind !== kind) {
      currentList = document.createElement(kind === 'ordered' ? 'ol' : 'ul');
      currentKind = kind;
      parent.insertBefore(currentList, child);
    }

    const listItem = document.createElement('li');
    moveListItemContent(child, listItem);
    currentList.append(listItem);
    child.remove();
  }
}

function isWordListBlock(element: HTMLElement): boolean {
  const className = element.getAttribute('class') ?? '';
  const style = element.getAttribute('style') ?? '';

  return /\bMsoListParagraph\b/i.test(className) || /mso-list\s*:/i.test(style);
}

function getWordListKind(element: HTMLElement): 'ordered' | 'bullet' {
  const text = element.textContent?.trim() ?? '';

  return /^(?:\d+|[a-z]|[ivxlcdm]+)[.)]/i.test(text) ? 'ordered' : 'bullet';
}

function moveListItemContent(source: HTMLElement, target: HTMLLIElement) {
  while (source.firstChild) {
    target.append(source.firstChild);
  }

  removeWordListMarker(target);
}

function removeWordListMarker(element: HTMLElement) {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? '';
      const nextText = text.replace(/^\s*(?:[•·o-]|\d+\.|[a-z][.)]|[ivxlcdm]+[.)])\s*/i, '');

      if (nextText !== text) {
        child.textContent = nextText;
      }

      if (nextText.trim()) {
        return;
      }

      child.remove();
      continue;
    }

    if (!(child instanceof HTMLElement)) {
      continue;
    }

    const childText = child.textContent ?? '';
    const style = child.getAttribute('style') ?? '';

    if (/mso-list\s*:\s*Ignore/i.test(style) || /^\s*(?:[•·o-]|\d+\.|[a-z][.)]|[ivxlcdm]+[.)])\s*$/.test(childText)) {
      child.remove();
      continue;
    }

    removeWordListMarker(child);

    if (child.textContent?.trim()) {
      return;
    }
  }
}

function applySemanticMarks(element: Element) {
  const style = element.getAttribute('style')?.toLowerCase() ?? '';
  const wrappers: string[] = [];

  if (/font-weight\s*:\s*(bold|[6-9]00)/.test(style)) {
    wrappers.push('strong');
  }

  if (/font-style\s*:\s*italic/.test(style)) {
    wrappers.push('em');
  }

  if (/text-decoration(?:-line)?\s*:[^;]*underline/.test(style)) {
    wrappers.push('u');
  }

  if (/text-decoration(?:-line)?\s*:[^;]*line-through/.test(style)) {
    wrappers.push('s');
  }

  if (!wrappers.length) {
    return;
  }

  let parent: Element = element;

  for (const tagName of wrappers) {
    const wrapper = document.createElement(tagName);

    while (parent.firstChild) {
      wrapper.append(parent.firstChild);
    }

    parent.append(wrapper);
    parent = wrapper;
  }
}

function stripNoisyAttributes(element: Element) {
  const attributes = Array.from(element.attributes);

  for (const attribute of attributes) {
    const name = attribute.name.toLowerCase();

    if (name === 'href') {
      continue;
    }

    if (name === 'style' || name === 'class' || name === 'lang' || name.startsWith('data-') || name.startsWith('aria-') || name.includes(':')) {
      element.removeAttribute(attribute.name);
    }
  }
}

function fallbackSanitizePastedHTML(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script|xml)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(meta|link|img)[^>]*>/gi, '')
    .replace(/<table[\s\S]*?<\/table>/gi, '')
    .replace(/\s(?:style|class|lang|data-[\w-]+|aria-[\w-]+|\w+:\w+)=("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}