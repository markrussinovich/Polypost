// Test-only stub for the build-time `virtual:pwa-register` module, which only
// exists when vite-plugin-pwa processes a real Vite build. Aliased in via the
// `test.alias` entry in vite.config.ts so importing src/pwa.ts works under vitest.
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return async () => {};
}
