import { useState } from 'react';
import { AlertTriangle, FileText, Globe, Loader, Plus, Type, X } from 'lucide-react';

import { getAcceptedDocumentTypes } from '../lib/importDocument';
import {
  makeDocumentSource,
  makeTextSource,
  withPastedText,
  type Source,
} from '../lib/ai/sources';
import { SourcePreview } from './SourcePreview';

interface SourcesPanelProps {
  sources: Source[];
  onAddSource: (source: Source) => void;
  onUpdateSource: (id: string, source: Source) => void;
  onRemoveSource: (id: string) => void;
}

type AddMode = 'text' | null;

const KIND_ICON = { doc: FileText, url: Globe, text: Type } as const;

export function SourcesPanel({ sources, onAddSource, onUpdateSource, onRemoveSource }: SourcesPanelProps) {
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [textValue, setTextValue] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<Source | null>(null);

  function handleAddText() {
    const trimmed = textValue.trim();

    if (!trimmed) {
      return;
    }

    onAddSource(makeTextSource(textTitle, trimmed));
    setTextValue('');
    setTextTitle('');
    setAddMode(null);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      onAddSource(await makeDocumentSource(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="sources-panel">
      <summary>
        Reference sources for AI{sources.length ? ` (${sources.length})` : ''}
      </summary>
      <p className="sources-hint">Give the AI material to use as its context for its generation.</p>

      <div className="sources-actions">
        <label className="secondary-action sources-file" title="Add a .txt, .md, or .docx file">
          <FileText aria-hidden="true" size={14} /> Add file
          <input type="file" accept={getAcceptedDocumentTypes()} disabled={busy} onChange={handleFile} />
        </label>
        <button type="button" className="secondary-action" disabled={busy} onClick={() => setAddMode((mode) => (mode === 'text' ? null : 'text'))}>
          <Type aria-hidden="true" size={14} /> Paste text
        </button>
        {busy ? <Loader aria-hidden="true" size={14} className="spin sources-busy" /> : null}
      </div>

      {addMode === 'text' ? (
        <div className="sources-text-row">
          <input
            type="text"
            value={textTitle}
            placeholder="Title (optional)"
            aria-label="Source title"
            onChange={(event) => setTextTitle(event.target.value)}
          />
          <textarea
            value={textValue}
            placeholder="Paste reference text…"
            aria-label="Source text"
            rows={4}
            onChange={(event) => setTextValue(event.target.value)}
          />
          <button type="button" className="primary-action" disabled={!textValue.trim()} onClick={handleAddText}>
            <Plus aria-hidden="true" size={14} /> Add source
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="sources-error" role="status">
          <AlertTriangle aria-hidden="true" size={14} /> {error}
        </p>
      ) : null}

      {sources.length ? (
        <ul className="sources-list">
          {sources.map((source) => (
            <SourceItem
              key={source.id}
              source={source}
              onUpdate={onUpdateSource}
              onRemove={onRemoveSource}
              onOpen={setPreviewSource}
            />
          ))}
        </ul>
      ) : null}

      {previewSource ? <SourcePreview source={previewSource} onClose={() => setPreviewSource(null)} /> : null}
    </details>
  );
}

interface SourceItemProps {
  source: Source;
  onUpdate: (id: string, source: Source) => void;
  onRemove: (id: string) => void;
  onOpen: (source: Source) => void;
}

function SourceItem({ source, onUpdate, onRemove, onOpen }: SourceItemProps) {
  const [paste, setPaste] = useState('');
  const needsText = source.status === 'needs-text';

  return (
    <li className={`source-item${needsText ? ' is-pending' : ''}`}>
      <div
        className="source-item-head is-openable"
        role="button"
        tabIndex={0}
        title="Double-click to open"
        onDoubleClick={() => onOpen(source)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onOpen(source);
          }
        }}
      >
        <SourceIcon source={source} />
        <span className="source-title" title={source.url ?? source.title}>{source.title}</span>
        <span className="source-meta">{source.status === 'ready' ? `${source.charCount.toLocaleString()} chars` : 'needs text'}</span>
        <button
          type="button"
          className="source-remove"
          aria-label={`Remove ${source.title}`}
          onClick={() => onRemove(source.id)}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <X aria-hidden="true" size={14} />
        </button>
      </div>
      {needsText ? (
        <div className="source-fallback">
          <p className="source-fallback-note">
            <AlertTriangle aria-hidden="true" size={13} /> Preview is available, but this site blocks browser text import. Paste the article text here.
          </p>
          <textarea
            value={paste}
            placeholder="Paste the page text…"
            aria-label={`Pasted text for ${source.title}`}
            rows={3}
            onChange={(event) => setPaste(event.target.value)}
          />
          <button type="button" className="secondary-action" disabled={!paste.trim()} onClick={() => onUpdate(source.id, withPastedText(source, paste))}>
            <Plus aria-hidden="true" size={14} /> Use this text
          </button>
        </div>
      ) : null}
    </li>
  );
}

// URL sources show the site's favicon; docs/text use a lucide glyph. The favicon
// falls back to the globe icon if it can't load.
function SourceIcon({ source }: { source: Source }) {
  const [failed, setFailed] = useState(false);

  if (source.kind === 'url' && source.url && !failed) {
    let host = '';
    try {
      host = new URL(source.url).hostname;
    } catch {
      host = '';
    }

    if (host) {
      return (
        <img
          src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
          alt=""
          className="source-favicon"
          width={14}
          height={14}
          onError={() => setFailed(true)}
        />
      );
    }
  }

  const Icon = source.kind === 'url' ? Globe : KIND_ICON[source.kind];
  return <Icon aria-hidden="true" size={14} className="source-icon" />;
}
