import { useState } from 'react';

import { docToMarkdown } from '../lib/ai/docText';
import type { AiProposal } from '../lib/ai/review';
import { renderForPlatform, PLATFORMS_BY_ID } from '../lib/platforms';

interface AiReviewProps {
  proposal: AiProposal;
  busy: boolean;
  onAccept: () => Promise<void>;
  onReject: () => void;
  onRegenerate: () => void;
}

export function AiReview({ proposal, busy, onAccept, onReject, onRegenerate }: AiReviewProps) {
  const [accepting, setAccepting] = useState(false);
  const spec = proposal.platform ? PLATFORMS_BY_ID[proposal.platform] : null;
  const before = spec ? renderForPlatform(proposal.before, spec).text : docToMarkdown(proposal.before);
  const after = spec ? renderForPlatform(proposal.after, spec).text : docToMarkdown(proposal.after);
  const label = spec?.label ?? 'master draft';
  const change = !before.trim() ? 'Written' : after.length < before.length ? 'Shortened and rewritten' : 'Rewritten';
  const counts = spec
    ? `${renderForPlatform(proposal.before, spec).summary.count} → ${renderForPlatform(proposal.after, spec).summary.count} / ${spec.charLimit} characters`
    : 'Comparison shows Markdown formatting.';

  async function accept() {
    setAccepting(true);
    try {
      await onAccept();
    } finally {
      setAccepting(false);
    }
  }

  return (
    <section className="ai-review" aria-label={`Review AI changes for ${label}`}>
      <strong>Review AI changes: {label}</strong>
      <p className="modal-hint">{change}. Your current text stays unchanged until you accept.</p>
      <p className="modal-hint">{counts}</p>
      {proposal.truncated ? (
        <p className="inline-alert" role="alert">
          The AI could not fit the post after repeated attempts. This suggestion was mechanically cut to length.
          Review it for missing context, mentions, and links before accepting.
        </p>
      ) : null}
      <div className="ai-review-comparison">
        <div><h3>Before</h3><pre>{before || '(Empty draft)'}</pre></div>
        <div><h3>Suggested</h3><pre>{after}</pre></div>
      </div>
      <div className="draft-item-actions">
        <button type="button" className="primary-action" disabled={busy || accepting} onClick={() => void accept()}>
          {accepting ? 'Saving recovery...' : 'Accept changes'}
        </button>
        <button type="button" className="secondary-action" disabled={busy || accepting} onClick={onReject}>Reject</button>
        <button type="button" className="secondary-action" disabled={busy || accepting} onClick={onRegenerate}>Regenerate</button>
      </div>
    </section>
  );
}
