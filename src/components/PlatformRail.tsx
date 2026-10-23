import { AlertTriangle } from 'lucide-react';

import type { EditorNode } from '../lib/exportText';
import type { Attachment, LinkPreview } from '../lib/media';
import type { PlatformId, PlatformRender, PlatformSpec } from '../lib/platforms/types';
import { PlatformCard } from './PlatformCard';

interface PlatformRailProps {
  // Enabled specs in display order.
  specs: PlatformSpec[];
  renders: Map<PlatformId, PlatformRender>;
  // The document each platform renders/edits from (override when forked, else master).
  documents: Map<PlatformId, EditorNode>;
  forkedIds: Set<PlatformId>;
  aiAdaptedIds: ReadonlySet<PlatformId>;
  // One selected image shown instead of URL previews, matching platform behavior.
  imageAttachment: Attachment | null;
  // Fetched metadata for URLs found in platform text, keyed by URL.
  linkPreviews: ReadonlyMap<string, LinkPreview>;
  generatingIds: ReadonlySet<PlatformId>;
  aiReady: boolean;
  aiError: string | null;
  editingId: PlatformId | null;
  masterVersion: number;
  onStartEditing: (id: PlatformId) => void;
  onStopEditing: () => void;
  onPaneChange: (id: PlatformId, document: EditorNode) => void;
  onResync: (id: PlatformId) => void;
  onFit: (id: PlatformId) => void;
}

export function PlatformRail({
  specs,
  renders,
  documents,
  forkedIds,
  aiAdaptedIds,
  imageAttachment,
  linkPreviews,
  generatingIds,
  aiReady,
  aiError,
  editingId,
  masterVersion,
  onStartEditing,
  onStopEditing,
  onPaneChange,
  onResync,
  onFit,
}: PlatformRailProps) {
  if (specs.length === 0) {
    return (
      <aside className="platform-rail is-empty" aria-label="Platform previews">
        <p className="platform-rail-empty">Enable a platform above to preview your post.</p>
      </aside>
    );
  }

  return (
    <aside className="platform-rail" aria-label="Platform previews">
      {aiError ? (
        <p className="rail-ai-error" role="status">
          <AlertTriangle aria-hidden="true" size={14} /> {aiError}
        </p>
      ) : null}
      {specs.map((spec) => {
        const render = renders.get(spec.id);
        const document = documents.get(spec.id);

        if (!render || !document) {
          return null;
        }

        return (
          <PlatformCard
            key={spec.id}
            spec={spec}
            render={render}
            document={document}
            isForked={forkedIds.has(spec.id)}
            isAiAdapted={aiAdaptedIds.has(spec.id)}
            imageAttachment={imageAttachment}
            linkPreviews={linkPreviews}
            isGenerating={generatingIds.has(spec.id)}
            aiReady={aiReady}
            isEditing={editingId === spec.id}
            masterVersion={masterVersion}
            onStartEditing={() => onStartEditing(spec.id)}
            onStopEditing={onStopEditing}
            onPaneChange={(doc) => onPaneChange(spec.id, doc)}
            onResync={() => onResync(spec.id)}
            onFit={() => onFit(spec.id)}
          />
        );
      })}
    </aside>
  );
}
