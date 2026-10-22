import { useEffect, useState } from 'react';

import { docToPlainText } from '../lib/ai/docText';
import type { LibraryDraft } from '../lib/draftLibrary';

interface DraftHistoryPanelProps {
  drafts: LibraryDraft[];
  activeDraftId?: string | null;
  onDelete: (draft: LibraryDraft) => void;
  onRestore: (draft: LibraryDraft) => void;
  onSave: (title: string, update?: boolean) => Promise<boolean>;
  onExport?: () => Promise<void>;
  onImport?: (file: File) => Promise<void>;
}

export function DraftHistoryPanel({ drafts, activeDraftId, onDelete, onRestore, onSave, onExport, onImport }: DraftHistoryPanelProps) {
  const activeDraft = drafts.find((draft) => draft.id === activeDraftId);
  const [title, setTitle] = useState(createDefaultTitle);
  const [search, setSearch] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasLibrary = Boolean(onExport && onImport);

  useEffect(() => {
    setTitle(activeDraft?.title ?? createDefaultTitle());
  }, [activeDraft?.id, activeDraft?.title]);

  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    try {
      await operation();
    } finally {
      setBusy(false);
    }
  }

  const visible = drafts.filter((draft) => {
    if ((draft.kind === 'recovery') !== showRecovery) return false;
    const haystack = [
      draft.title, docToPlainText(draft.document),
      ...Object.values(draft.overrides ?? {}).map(docToPlainText),
      ...Object.values(draft.aiVersions ?? {}).map(docToPlainText),
    ].join(' ').toLocaleLowerCase();
    return haystack.includes(search.trim().toLocaleLowerCase());
  });

  return (
    <details className="draft-history-panel">
      <summary>Saved drafts</summary>
      <div className="draft-library-body">
        <p className="modal-hint">
          {hasLibrary
            ? 'Named drafts are never automatically removed. Recovery keeps the latest 20 checkpoints, saved after 10 seconds of inactivity and before replacing content. Browser data can be cleared; export backups regularly.'
            : 'Keep up to 10 saved drafts in this browser. The oldest is replaced when you save another.'}
        </p>
        <div className="draft-history-actions">
          <label className="draft-title-field">
            <span>Draft name</span>
            <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <button type="button" className="secondary-action" disabled={busy || !title.trim()} onClick={() => void run(() => onSave(title))}>
            Save draft
          </button>
          {activeDraft ? (
            <button type="button" className="secondary-action" disabled={busy || !title.trim()} onClick={() => void run(() => onSave(title, true))}>
              Update draft
            </button>
          ) : null}
        </div>
        {onExport && onImport ? (
        <>
        <div className="draft-library-tools">
          <button type="button" className="secondary-action" disabled={busy} onClick={() => void run(onExport)}>Export backup</button>
          <label className="secondary-action image-add-button">
            Import backup
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void run(() => onImport(file));
              }}
            />
          </label>
        </div>
        <p className="modal-hint">Backups include all drafts, recovery history, current text, variants, sources, and attachments. API keys and AI settings are excluded. Imports add drafts without replacing anything.</p>
        </>
        ) : null}
        <label className="draft-title-field">
          <span>Search drafts</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        {hasLibrary ? (
        <div className="draft-library-tools" role="group" aria-label="Draft library view">
          <button type="button" className="secondary-action" aria-pressed={!showRecovery} onClick={() => setShowRecovery(false)}>
            Named drafts ({drafts.filter((draft) => draft.kind === 'draft').length})
          </button>
          <button type="button" className="secondary-action" aria-pressed={showRecovery} onClick={() => setShowRecovery(true)}>
            Recovery history ({drafts.filter((draft) => draft.kind === 'recovery').length})
          </button>
        </div>
        ) : null}
        {visible.length ? (
          <ul className="draft-list">
            {visible.map((draft) => (
              <li key={draft.id} className="draft-item">
                <div className="draft-item-main">
                  <div>
                    <strong>{draft.title}{draft.id === activeDraftId ? ' (current)' : ''}</strong>
                    <span>{draft.characterCount.toLocaleString()} chars · {new Date(draft.updatedAt).toLocaleString()}</span>
                  </div>
                  <p className="draft-preview">{docToPlainText(draft.document).replace(/\s+/g, ' ').slice(0, 140) || 'Empty master draft'}</p>
                </div>
                <div className="draft-item-actions">
                  <button type="button" className="draft-restore" disabled={busy} onClick={() => onRestore(draft)}>Restore</button>
                  <button type="button" className="draft-delete" disabled={busy} onClick={() => onDelete(draft)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="draft-empty">{search ? 'No matching drafts.' : showRecovery ? 'No recovery checkpoints yet.' : 'No saved drafts yet.'}</p>
        )}
      </div>
    </details>
  );
}

function createDefaultTitle() {
  return `Draft ${new Date().toLocaleString()}`;
}
