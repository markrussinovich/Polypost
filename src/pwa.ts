// Service-worker registration for the PWA build. registerType is 'prompt' (see
// vite.config.ts), so a new deploy does NOT reload on its own — we surface a
// toast and let the user choose when to reload, avoiding interrupted edits.
// In dev (SW disabled) virtual:pwa-register resolves to a no-op stub, so this is
// safe to import unconditionally.
import { registerSW } from 'virtual:pwa-register';

type NeedRefreshListener = (needRefresh: boolean) => void;

let needRefresh = false;
const listeners = new Set<NeedRefreshListener>();
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

// Register the service worker and start listening for updates. Call once on startup.
export function initPwa(): void {
  if (typeof window === 'undefined') {
    return;
  }

  updateSW = registerSW({
    onNeedRefresh() {
      needRefresh = true;
      listeners.forEach((listener) => listener(true));
    },
    // App shell is cached and ready offline; the minimal offline scope needs no UI here.
    onOfflineReady() {},
  });
}

// Subscribe to "a new version is waiting" changes. Returns an unsubscribe fn.
// Replays the current state so a late subscriber still learns about a pending update.
export function subscribeNeedRefresh(listener: NeedRefreshListener): () => void {
  listeners.add(listener);

  if (needRefresh) {
    listener(true);
  }

  return () => {
    listeners.delete(listener);
  };
}

// Activate the waiting service worker and reload into the new version.
export function applyUpdate(): void {
  void updateSW?.(true);
}
