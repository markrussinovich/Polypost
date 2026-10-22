import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LibraryDraft } from '../lib/draftLibrary';
import { DraftHistoryPanel } from './DraftHistoryPanel';

afterEach(cleanup);

const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Master' }] }] };
const drafts: LibraryDraft[] = [
  {
    id: 'named', kind: 'draft', title: 'Launch', document, createdAt: 1, updatedAt: 2, characterCount: 6,
    overrides: { x: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unique platform detail' }] }] } },
  },
  { id: 'recovery', kind: 'recovery', title: 'Before AI', document, createdAt: 1, updatedAt: 1, characterCount: 6 },
];

describe('draft library panel', () => {
  it('searches customized variants and separates recoveries from named drafts', () => {
    const onRestore = vi.fn();
    render(<DraftHistoryPanel drafts={drafts} activeDraftId={null} onRestore={onRestore} onDelete={vi.fn()} onSave={vi.fn()}
      onExport={vi.fn()} onImport={vi.fn()} />);
    fireEvent.click(screen.getByText('Saved drafts'));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Unique platform detail' } });
    expect(screen.getByText('Launch')).toBeInTheDocument();
    expect(screen.queryByText('Before AI')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Recovery history/ }));
    expect(screen.getByText('Before AI')).toBeInTheDocument();
    expect(screen.queryByText('Launch')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRestore).toHaveBeenCalledWith(drafts[1]);
  });
});
