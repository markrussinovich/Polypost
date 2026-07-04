import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

// The browser's install event isn't in the standard DOM lib types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  // iOS Safari exposes navigator.standalone; everyone else uses the media query.
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

// "Install app" button that appears only when the browser has offered an install
// prompt (and the app isn't already installed/running standalone). Complements —
// doesn't replace — the browser's own address-bar install affordance.
export function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      // Stop Chrome's mini-infobar so we can trigger the prompt from our button.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !deferredPrompt) {
    return null;
  }

  async function handleInstall() {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    // The event can only be used once; drop it whatever the user chooses.
    setDeferredPrompt(null);
  }

  return (
    <button
      type="button"
      className="header-icon-button"
      aria-label="Install Polypost as an app"
      title="Install app"
      onClick={handleInstall}
    >
      <Download aria-hidden="true" size={18} />
    </button>
  );
}
