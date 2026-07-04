// Reference material the AI reads as background when authoring a post. Sources
// are separate from the draft (which the file import replaces) — they're context
// only, never published. Persisted locally under their own key so they survive a
// reload. See buildAuthorRequest in prompts.ts for how they reach the model.
import { importDocumentFile } from '../importDocument';
import { docToPlainText } from './docText';

export type SourceKind = 'doc' | 'url' | 'text';

// 'ready' sources have usable text; 'needs-text' is a URL whose page couldn't be
// fetched (CORS/network) and is waiting for the user to paste the text in.
export type SourceStatus = 'ready' | 'needs-text';

export interface Source {
  id: string;
  kind: SourceKind;
  title: string;
  text: string;
  charCount: number;
  status: SourceStatus;
  // Present for url sources; lets the UI re-link and show the origin.
  url?: string;
}

const SOURCES_KEY = 'omnipost:sources-v1';

// Per-source and total caps on the text injected into the prompt, so a large
// document can't blow the model's context or the user's token budget.
export const MAX_SOURCE_CHARS = 8000;
export const MAX_TOTAL_SOURCE_CHARS = 16000;

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `src-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function makeTextSource(title: string, text: string): Source {
  const trimmed = text.trim();
  return { id: newId(), kind: 'text', title: title.trim() || 'Pasted text', text: trimmed, charCount: trimmed.length, status: 'ready' };
}

// Pull plain text out of an uploaded .txt/.md/.docx by reusing the existing draft
// importer, then flattening whatever it produces to text. No new file parsing.
export async function makeDocumentSource(file: File): Promise<Source> {
  const imported = await importDocumentFile(file);
  const text = (imported.format === 'json' ? docToPlainText(imported.document) : htmlToPlainText(imported.html)).trim();

  if (!text) {
    throw new Error('No readable text was found in that file.');
  }

  return { id: newId(), kind: 'doc', title: file.name, text, charCount: text.length, status: 'ready' };
}

// Fill in (or replace) a source's text from text the user pasted. Used to edit a
// text source or supply text for any source still waiting on it.
export function withPastedText(source: Source, text: string): Source {
  const trimmed = text.trim();
  return { ...source, text: trimmed, charCount: trimmed.length, status: trimmed ? 'ready' : 'needs-text' };
}

// Strip an HTML document to readable text: drop non-content elements, prefer the
// main article body, and collapse whitespace. Runs in the browser via DOMParser.
function htmlToPlainText(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, nav, header, footer, aside, svg, template').forEach((el) => el.remove());

  const main = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.body;
  const raw = main?.textContent ?? '';
  return raw.replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}

// Build the capped reference block injected into the authoring prompt, or null
// when there's nothing usable. Per-source and total caps both apply.
export function buildSourcesBlock(sources: Source[]): string | null {
  const ready = sources.filter((source) => source.status === 'ready' && source.text.trim());

  if (ready.length === 0) {
    return null;
  }

  const parts: string[] = [];
  let total = 0;

  for (const source of ready) {
    if (total >= MAX_TOTAL_SOURCE_CHARS) {
      break;
    }

    const remaining = MAX_TOTAL_SOURCE_CHARS - total;
    const limit = Math.min(MAX_SOURCE_CHARS, remaining);
    const truncated = source.text.length > limit;
    const body = truncated ? `${source.text.slice(0, limit)}\n…[truncated]` : source.text;
    total += body.length;

    const label = source.url ? `${source.title} (${source.url})` : source.title;
    parts.push(`--- ${label} ---\n${body}`);
  }

  return parts.join('\n\n');
}

export function loadSources(): Source[] {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SOURCES_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Source[]) : [];
  } catch {
    return [];
  }
}

export function saveSources(sources: Source[]): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SOURCES_KEY, JSON.stringify(sources));
  } catch {
    // Non-fatal: sources still work in memory for this session.
  }
}
