import { useMemo, useState } from 'react';

import { docToMarkdown } from '../lib/ai/docText';
import { groupReviewChanges, reviewChanges, type AiProposal } from '../lib/ai/review';
import { renderForPlatform, PLATFORMS_BY_ID } from '../lib/platforms';
import { markdownToTipTap } from '../lib/markdownToTipTap';
import type { EditorNode } from '../lib/exportText';

interface AiReviewProps {
  proposal: AiProposal;
  busy: boolean;
  onAccept: (document?: EditorNode) => Promise<void>;
  onReject: () => void;
  onRegenerate: () => void;
}

export function AiReview({ proposal, busy, onAccept, onReject, onRegenerate }: AiReviewProps) {
  return <ReviewProposal key={JSON.stringify(proposal)} proposal={proposal} busy={busy} onAccept={onAccept} onReject={onReject} onRegenerate={onRegenerate} />;
}

function ReviewProposal({ proposal, busy, onAccept, onReject, onRegenerate }: AiReviewProps) {
  const [accepting, setAccepting] = useState(false);
  const [decisions, setDecisions] = useState<Record<number, 'accepted' | 'rejected'>>({});
  const [selected, setSelected] = useState(0);
  const spec = proposal.platform ? PLATFORMS_BY_ID[proposal.platform] : null;
  const before = docToMarkdown(proposal.before);
  const after = docToMarkdown(proposal.after);
  const label = spec?.label ?? 'master draft';
  const changes = useMemo(() => groupReviewChanges(reviewChanges(before, after)), [before, after]);
  const pending = changes.flatMap((change, index) => change.changed && !decisions[index] ? [index] : []);
  const current = pending.includes(selected) ? selected : pending[0];
  const initialDraft = !before.trim();
  const change = !before.trim() ? 'Written' : after.length < before.length ? 'Shortened and rewritten' : 'Rewritten';
  const reviewedText = changes.map((change, index) => decisions[index] === 'rejected' ? change.before : change.after).join('');
  const reviewedDocument = useMemo(
    () => reviewedText === after ? proposal.after
      : reviewedText === before ? proposal.before
        : markdownToTipTap(reviewedText),
    [reviewedText, before, after, proposal.before, proposal.after],
  );
  const counts = spec
    ? `${renderForPlatform(proposal.before, spec).summary.count} → ${renderForPlatform(reviewedDocument, spec).summary.count} / ${spec.charLimit} characters`
    : '';

  async function accept() {
    setAccepting(true);
    try {
      await onAccept(reviewedDocument);
    } finally {
      setAccepting(false);
    }
  }

  function decide(decision: 'accepted' | 'rejected') {
    if (current === undefined) return;
    setDecisions((previous) => ({ ...previous, [current]: decision }));
    setSelected(pending.find((index) => index > current) ?? pending[0]);
  }

  function navigate(direction: number) {
    if (current === undefined) return;
    setSelected(pending[(pending.indexOf(current) + direction + pending.length) % pending.length]);
  }

  return (
    <section className="ai-review" aria-label={`Review AI changes for ${label}`}>
      <strong>Review AI changes: {label}</strong>
      <p className="modal-hint">{change}. Your current text stays unchanged until you accept.</p>
      <p className="modal-hint">{counts} Review shows Markdown formatting and mention tokens.</p>
      {proposal.truncated ? (
        <p className="inline-alert" role="alert">
          The AI could not fit the post after repeated attempts. This suggestion was mechanically cut to length.
          Review it for missing context, mentions, and links before accepting.
        </p>
      ) : null}
      <p className="modal-hint">
        {initialDraft ? 'Initial draft: all text is unmarked.' : 'Tracked changes: additions are underlined; removals are struck through.'}
      </p>
      {!initialDraft ? (
        <div className="ai-review-toolbar" role="group" aria-label="Review changes">
          <button type="button" className="secondary-action" disabled={busy || accepting || !pending.length} onClick={() => navigate(-1)}>Previous change</button>
          <button type="button" className="secondary-action" disabled={busy || accepting || !pending.length} onClick={() => navigate(1)}>Next change</button>
          <span role="status">{pending.length ? `Change ${pending.indexOf(current) + 1} of ${pending.length}` : 'All changes reviewed'}</span>
          <button type="button" className="secondary-action" disabled={busy || accepting || !pending.length} onClick={() => decide('accepted')}>Accept change</button>
          <button type="button" className="secondary-action" disabled={busy || accepting || !pending.length} onClick={() => decide('rejected')}>Reject change</button>
          <button type="button" className="secondary-action" disabled={busy || accepting || !pending.length} onClick={() => setDecisions((previous) => ({ ...previous, ...Object.fromEntries(pending.map((index) => [index, 'accepted' as const])) }))}>Accept All</button>
          <button type="button" className="secondary-action" disabled={busy || accepting || !pending.length} onClick={() => setDecisions((previous) => ({ ...previous, ...Object.fromEntries(pending.map((index) => [index, 'rejected' as const])) }))}>Reject All</button>
        </div>
      ) : null}
      <div className="ai-review-changes" role="region" aria-label={`Tracked changes for ${label}`}>
        {changes.map((change, index) => !change.changed || decisions[index]
          ? <span key={index}>{decisions[index] === 'rejected' ? change.before : change.after}</span>
          : <span
              key={index} className={index === current ? 'ai-review-change is-current' : 'ai-review-change'}
              role="button" tabIndex={busy || accepting ? -1 : 0}
              aria-label={`Select change ${pending.indexOf(index) + 1}`} aria-pressed={index === current}
              onClick={() => { if (!busy && !accepting) setSelected(index); }}
              onKeyDown={(event) => {
                if (!busy && !accepting && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  setSelected(index);
                }
              }}
            >
              {change.before ? <del aria-label="Removed text">{change.before}</del> : null}
              {change.after ? <ins aria-label="Added text">{change.after}</ins> : null}
            </span>)}
      </div>
      {!initialDraft ? <p className="modal-hint">Accept or reject individual changes above, then Accept changes to apply your reviewed draft. Unreviewed changes will be accepted. Reject below discards the entire suggestion.</p> : null}
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
