import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { applyUpdate, subscribeNeedRefresh } from '../pwa';

// Bottom toast shown when a new app version has been installed by the service
// worker and is waiting to activate. Clicking "Reload" swaps in the new version
// (registerType is 'prompt', so nothing reloads until the user opts in).
export function UpdatePrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeNeedRefresh(setVisible), []);

  if (!visible) {
    return null;
  }

  return (
    <div className="update-toast" role="status" aria-live="polite">
      <span className="update-toast__label">A new version is available.</span>
      <button type="button" className="update-toast__action" onClick={applyUpdate}>
        <RefreshCw aria-hidden="true" size={15} />
        Reload
      </button>
    </div>
  );
}
