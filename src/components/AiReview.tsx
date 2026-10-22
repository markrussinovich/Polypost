import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

import { docToMarkdown } from '../lib/ai/docText';
import { groupReviewChanges, reviewChanges, type AiProposal } from '../lib/ai/review';
import { PLATFORMS_BY_ID } from '../lib/platforms';
import { markdownToTipTap } from '../lib/markdownToTipTap';
import type { EditorNode } from '../lib/exportText';

interface AiReviewProps {
  proposal: AiProposal;
  busy: boolean;
  onAccept: (document?: EditorNode) => Promise<void>;
  onReject: () => void;
}

export function AiReview(props: AiReviewProps) {
  return <ReviewProposal key={JSON.stringify(props.proposal)} {...props} />;
}

function ReviewProposal({ proposal, busy, onAccept, onReject }: AiReviewProps) {
  const [saving, setSaving] = useState(false);
  const [decisions, setDecisions] = useState<Record<number, 'accepted' | 'rejected'>>({});
  const [edits, setEdits] = useState<Record<number, string>>({});
  const editValues = useRef(edits);
  const autoApplied = useRef(false);
  const before = docToMarkdown(proposal.before);
  const after = docToMarkdown(proposal.after);
  const label = proposal.platform ? PLATFORMS_BY_ID[proposal.platform].label : 'master draft';
  const changes = useMemo(() => groupReviewChanges(reviewChanges(before, after)), [before, after]);
  const pending = changes.flatMap((change, index) => change.changed && !decisions[index] ? [index] : []);
  const locked = busy || saving;

  function reviewedDocument(next: typeof decisions): EditorNode {
    const text = changes.map((change, index) =>
      editValues.current[index] ?? (next[index] === 'rejected' ? change.before : change.after),
    ).join('');
    return text === before ? proposal.before : text === after ? proposal.after : markdownToTipTap(text);
  }

  async function apply(next: typeof decisions) {
    setSaving(true);
    try {
      const document = reviewedDocument(next);
      if (document === proposal.before) onReject();
      else await onAccept(document);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!pending.length && !autoApplied.current && !busy) {
      autoApplied.current = true;
      void apply(decisions);
    }
    // Initial drafts and identical suggestions need no review action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  function decide(index: number, decision: 'accepted' | 'rejected') {
    const next = { ...decisions, [index]: decision };
    const nextEdits = { ...editValues.current };
    if (decision === 'rejected') delete nextEdits[index];
    editValues.current = nextEdits;
    setEdits(nextEdits);
    setDecisions(next);
    if (pending.length === 1) void apply(next);
  }

  function decideAll(decision: 'accepted' | 'rejected') {
    const next = { ...decisions, ...Object.fromEntries(pending.map((index) => [index, decision])) };
    if (decision === 'rejected') {
      const nextEdits = { ...editValues.current };
      for (const index of pending) delete nextEdits[index];
      editValues.current = nextEdits;
      setEdits(nextEdits);
    }
    setDecisions(next);
    void apply(next);
  }

  function editable(text: string, index: number) {
    function insertText(element: HTMLSpanElement, text: string) {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      editValues.current = { ...editValues.current, [index]: element.textContent ?? '' };
    }

    return (
      <span
        contentEditable={!locked}
        suppressContentEditableWarning
        role="textbox"
        aria-label={`Edit ${label} passage ${index + 1}`}
        aria-multiline="true"
        onInput={(event) => {
          editValues.current = { ...editValues.current, [index]: event.currentTarget.textContent ?? '' };
        }}
        onPaste={(event) => {
          event.preventDefault();
          insertText(event.currentTarget, event.clipboardData.getData('text/plain'));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            insertText(event.currentTarget, '\n');
          }
        }}
        onBlur={() => {
          setEdits(editValues.current);
          if (!pending.length && !locked) void apply(decisions);
        }}
      >{edits[index] ?? text}</span>
    );
  }

  return (
    <section className="ai-review" aria-label={`Review AI changes for ${label}`}>
      {proposal.truncated ? <p className="inline-alert" role="alert">Suggestion was cut to fit.</p> : null}
      {pending.length ? (
        <div className="ai-review-toolbar" role="group" aria-label="Review changes">
          <span role="status">{pending.length} {pending.length === 1 ? 'change' : 'changes'}</span>
          <button type="button" className="secondary-action" disabled={locked} onClick={() => decideAll('accepted')}>Accept All</button>
          <button type="button" className="secondary-action" disabled={locked} onClick={() => decideAll('rejected')}>Reject All</button>
        </div>
      ) : null}
      <div className="ai-review-changes" role="region" aria-label={`Tracked changes for ${label}`}>
        {changes.map((change, index) => !change.changed || decisions[index]
          ? <span key={index}>{editable(decisions[index] === 'rejected' ? change.before : change.after, index)}</span>
          : <span key={index} className="ai-review-change">
              {change.before ? <del aria-label="Removed text">{change.before}</del> : null}
              {change.after ? <ins aria-label="Added text">{editable(change.after, index)}</ins> : null}
              <span className="ai-review-change-actions" contentEditable={false}>
                <button type="button" className="card-icon-button ai-review-accept" disabled={locked} aria-label={`Accept change ${pending.indexOf(index) + 1}`} title="Accept change" onClick={() => decide(index, 'accepted')}>
                  <Check aria-hidden="true" size={14} />
                </button>
                <button type="button" className="card-icon-button ai-review-reject" disabled={locked} aria-label={`Reject change ${pending.indexOf(index) + 1}`} title="Reject change" onClick={() => decide(index, 'rejected')}>
                  <X aria-hidden="true" size={14} />
                </button>
              </span>
            </span>)}
      </div>
      {!pending.length && !saving ? (
        <button type="button" className="secondary-action" disabled={busy} onClick={() => void apply(decisions)}>Retry save</button>
      ) : null}
    </section>
  );
}
