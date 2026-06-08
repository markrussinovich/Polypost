import { AlertTriangle, Copy, ExternalLink } from 'lucide-react';

export type CopyStatus =
  | { state: 'idle'; message: string }
  | { state: 'error'; message: string };

interface CopyPanelProps {
  disabled: boolean;
  status: CopyStatus;
  onCopy: () => void;
  onCopyAndOpenLinkedIn: () => void;
}

export function CopyPanel({ disabled, status, onCopy, onCopyAndOpenLinkedIn }: CopyPanelProps) {
  return (
    <div className={`copy-panel is-${status.state}`}>
      <div className="copy-actions">
        <button type="button" className="primary-action" disabled={disabled} onClick={onCopy}>
          <Copy aria-hidden="true" size={18} />
          Copy for LinkedIn
        </button>
        <button type="button" className="primary-action" disabled={disabled} onClick={onCopyAndOpenLinkedIn}>
          <ExternalLink aria-hidden="true" size={17} />
          Copy and open LinkedIn
        </button>
      </div>
      {status.state === 'error' ? (
        <p className="copy-status" role="status" aria-live="polite">
          <AlertTriangle aria-hidden="true" size={16} />
          {status.message}
        </p>
      ) : null}
    </div>
  );
}