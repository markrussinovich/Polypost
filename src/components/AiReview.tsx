import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { createPortal } from 'react-dom';

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
  const [appliedPreview, setAppliedPreview] = useState(false);
  const editValues = useRef(edits);
  const autoApplied = useRef(false);
  const [menu, setMenu] = useState<{ index: number; left: number; top: number; focus: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuAnchor = useRef<HTMLSpanElement | null>(null);
  const before = docToMarkdown(proposal.before);
  const after = docToMarkdown(proposal.after);
  const label = proposal.platform ? PLATFORMS_BY_ID[proposal.platform].label : 'master draft';
  const changes = useMemo(() => groupReviewChanges(reviewChanges(before, after)), [before, after]);
  const pending = changes.flatMap((change, index) => change.changed && !decisions[index] ? [index] : []);
  const locked = busy || saving;

  useEffect(() => {
    if (!menu) return;
    if (menu.focus) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(null);
        menuAnchor.current?.focus();
      }
    };
    const close = () => setMenu(null);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  function openMenu(element: HTMLSpanElement, index: number, focus: boolean, point?: { x: number; y: number }) {
    if (locked) return;
    const bounds = element.getBoundingClientRect();
    menuAnchor.current = element;
    setMenu({
      index,
      left: Math.max(8, Math.min(point?.x ?? bounds.left, window.innerWidth - 184)),
      top: Math.max(8, Math.min(point?.y ?? bounds.bottom + 4, window.innerHeight - 100)),
      focus,
    });
  }

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
    setMenu(null);
    const next = { ...decisions, [index]: decision };
    const nextEdits = { ...editValues.current };
    if (decision === 'rejected') delete nextEdits[index];
    editValues.current = nextEdits;
    setEdits(nextEdits);
    setDecisions(next);
    if (pending.length === 1) void apply(next);
  }

  function decideAll(decision: 'accepted' | 'rejected') {
    setMenu(null);
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
          <button type="button" className="secondary-action ai-review-accept" disabled={locked} onClick={() => decideAll('accepted')}>Accept All</button>
          <button type="button" className="secondary-action ai-review-reject" disabled={locked} onClick={() => decideAll('rejected')}>Reject All</button>
          <label className="ai-review-preview-toggle">
            <input
              type="checkbox"
              checked={appliedPreview}
              disabled={locked}
              onChange={(event) => {
                setEdits(editValues.current);
                setMenu(null);
                setAppliedPreview(event.target.checked);
              }}
            />
            View changes applied
          </label>
        </div>
      ) : null}
      <div className="ai-review-changes" role="region" aria-label={`Tracked changes for ${label}`}>
        {changes.map((change, index) => !change.changed || decisions[index] || appliedPreview
          ? <span key={index}>{editable(decisions[index] === 'rejected' ? change.before : change.after, index)}</span>
          : <span
              key={index}
              className="ai-review-change"
              role="group"
              tabIndex={locked ? -1 : 0}
              aria-label={`Change ${pending.indexOf(index) + 1}`}
              aria-haspopup="menu"
              aria-expanded={menu?.index === index}
              onClick={(event) => openMenu(event.currentTarget, index, false, { x: event.clientX, y: event.clientY })}
              onContextMenu={(event) => {
                event.preventDefault();
                openMenu(event.currentTarget, index, true, { x: event.clientX, y: event.clientY });
              }}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget &&
                    (event.key === 'Enter' || event.key === ' ' || event.key === 'ContextMenu' ||
                      (event.shiftKey && event.key === 'F10'))) {
                  event.preventDefault();
                  openMenu(event.currentTarget, index, true);
                }
              }}
            >
              {change.before ? <del aria-label="Removed text">{change.before}</del> : null}
              {change.after ? <ins aria-label="Added text">{editable(change.after, index)}</ins> : null}
            </span>)}
      </div>
      {menu && !locked ? createPortal(
        <div
          ref={menuRef}
          className="ai-review-menu"
          role="menu"
          aria-label="Change actions"
          style={{ left: menu.left, top: menu.top }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null);
          }}
          onKeyDown={(event) => {
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
            const current = buttons.findIndex((button) => button === document.activeElement);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              buttons[(current + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
            }
          }}
        >
          <button type="button" role="menuitem" onClick={() => decide(menu.index, 'accepted')}>
            <Check className="ai-review-accept" aria-hidden="true" size={14} /> Accept change
          </button>
          <button type="button" role="menuitem" onClick={() => decide(menu.index, 'rejected')}>
            <X className="ai-review-reject" aria-hidden="true" size={14} /> Reject change
          </button>
        </div>, document.body,
      ) : null}
      {!pending.length && !saving ? (
        <button type="button" className="secondary-action" disabled={busy} onClick={() => void apply(decisions)}>Retry save</button>
      ) : null}
    </section>
  );
}
