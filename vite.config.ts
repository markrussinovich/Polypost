import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [
    react(),
    // PWA for the web build only — the LinkedIn extension uses
    // vite.extension.config.ts and must never get a service worker/manifest.
    // 'prompt' lets the UI surface an "update available" toast instead of
    // silently reloading mid-edit.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      workbox: {
        // Precache the app shell so it opens offline. External hosts (AI
        // providers, microlink, favicon/thumbnail CDNs) are intentionally left
        // network-only — those features degrade as they do today when offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      manifest: {
        name: 'Polypost — multi-platform post editor',
        short_name: 'Polypost',
        description:
          "Draft once and format your post for LinkedIn, X, Bluesky, Threads, Facebook, and Instagram, with each platform's length and formatting limits applied live.",
        theme_color: '#6366f1',
        background_color: '#0b1120',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // The build-time virtual:pwa-register module isn't available under vitest;
    // point it at a stub so importing src/pwa.ts resolves. Test-scoped, so the
    // real virtual module still wins during `vite build`.
    alias: {
      'virtual:pwa-register': fileURLToPath(new URL('./src/test/pwaRegisterStub.ts', import.meta.url)),
    },
  },
});