import { X } from 'lucide-react';

import { useEscape } from '../lib/useEscape';
import { HelpContent } from './HelpContent';

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  useEscape(onClose);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={onClose}>
      <div className="modal-card help-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header help-modal-header">
          <h2 id="help-title">Using Polypost</h2>
          <button type="button" className="card-icon-button" aria-label="Close help" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="help-scroll">
          <HelpContent webApp />
        </div>
      </div>
    </div>
  );
}
