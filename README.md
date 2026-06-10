# LinkedIn Post Formatter

Draft LinkedIn posts with familiar rich-text controls, then publish through LinkedIn's own composer in one click. The editor uses TipTap for word-processor-style editing and exports bold, italic, code, lists, and links as LinkedIn-ready Unicode plain text.

It ships in two forms:

- **Web app** — a standalone formatter you copy text out of and paste into LinkedIn. Live at https://markrussinovich.github.io/LinkedIn-Formatter/
- **Browser extension** — runs on LinkedIn itself. Clicking **Start a post** opens the formatter *as* the composer; its **Post** button writes the formatted text into LinkedIn's native composer and submits through LinkedIn's own Post flow. See [Browser Extension](#browser-extension).

<p align="center">
  <img src="docs/screenshot.png" alt="LinkedIn Post Formatter screenshot" width="640">
</p>

This is not an official LinkedIn app. Drafts stay in your browser; the extension only acts on LinkedIn when you click Post.

## Features

- TipTap rich text editor with toolbar controls and keyboard shortcuts.
- Sans-serif Unicode bold, italic, bold italic, code, experimental underline, and experimental strikethrough export.
- Nested bullet and numbered lists with LinkedIn-friendly non-breaking-space indentation.
- Blockquotes exported as indented plain text, and horizontal dividers exported as plain divider lines.
- Links export as readable label plus URL, for example `Read more (https://example.com)`.
- Hashtags and mentions remain plain text so LinkedIn has the best chance to recognize them.
- Searchable emoji picker with emoji-safe export behavior.
- Pasted Markdown converts to formatted draft text for common inline marks, links, headings, fenced code, lists, blockquotes, and dividers.
- Pasted Word/Office HTML is cleaned into editor-friendly content while preserving common inline styling where possible.
- Upload or drag `.txt`, `.md`, `.markdown`, or `.docx` files into the draft editor.
- Live character counter plus desktop/mobile LinkedIn-style feed preview with an estimated "more" cutoff toggle.
- One-click copy with a fallback for browsers that block the Clipboard API.
- Local draft autosave, reset/recovery behavior, and saved drafts.
- Extension: one-click publish through LinkedIn's native composer, with the native composer kept hidden so the formatter feels like the real post box.
- GitHub Actions workflow for GitHub Pages deployment.

## Local Development

```bash
npm install
npm run dev
```

Run tests:

```bash
npm test
```

Build the web app for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Browser Extension

The extension turns the LinkedIn composer into the formatter. Clicking **Start a post** on LinkedIn opens the rich-text formatter in place of the native post box. When you click **Post**, the formatter exports LinkedIn-ready Unicode text, writes it into LinkedIn's native composer behind the scenes, and clicks LinkedIn's own **Post** button. The native composer stays hidden throughout, so it feels like you are posting directly from the formatter.

### How it works

- A content script (`src/extension/content-script.tsx`) runs on `linkedin.com`, mounts the formatter UI, and listens for clicks on LinkedIn's **Start a post** control.
- LinkedIn renders its composer inside a **shadow root**, so the script pierces shadow boundaries to find the composer, suppress it (CSS `visibility:hidden` while you edit, so its focus trap cannot steal focus from the formatter), and drive it.
- On **Post**, the script briefly makes the hidden composer focusable, inserts the exported text, waits for LinkedIn's Post button to enable, clicks it, and confirms the composer closed.
- A service worker (`src/extension/public/background.js`) re-injects the script if you click the toolbar icon on a LinkedIn tab.

### Permissions

- `host_permissions` for `*.linkedin.com` — the extension only runs on LinkedIn.
- `clipboardWrite` — the **Copy for LinkedIn** button.
- `scripting` — re-inject the formatter when the toolbar icon is clicked.

No analytics, no remote servers, no `chrome.storage` — drafts are kept in the page's `localStorage`.

### Build and load unpacked (for development)

```bash
npm run build:extension
```

Then load `dist-extension` as an unpacked extension from `chrome://extensions` or `edge://extensions` (enable Developer mode first). Do **not** load `src/extension`; only `dist-extension` contains the built `content-script.js`, `style.css`, `manifest.json`, and icons the browser runs.

After rebuilding, click **Reload** on the extension card, then reload any open LinkedIn tab (the content script injects its CSS on page load, so an extension reload alone keeps the old styles). If the extension is enabled but no formatter appears, remove the unpacked extension and load `dist-extension` again.

### Package for the Chrome Web Store

```bash
npm run package:extension
```

This builds the extension and writes `release/linkedin-post-formatter-v<version>.zip` with `manifest.json` at the archive root, ready to upload.

### Publish to the Chrome Web Store

1. Bump `version` in **both** `src/extension/manifest.json` and `package.json` (they must match), then run `npm run package:extension`.
2. Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/) (one-time US$5 developer registration fee).
3. Click **Add new item** and upload the zip from `release/`.
4. Complete the store listing: name, summary, detailed description, category (Social & Communication), at least one 1280×800 or 640×400 screenshot, and the 128×128 icon (already in the package).
5. Fill in the **Privacy** tab: a single purpose ("format and publish LinkedIn posts"), justifications for the `clipboardWrite`, `scripting`, and host permissions, and a privacy policy URL. Because no data leaves the browser, the data-use disclosures are "does not collect."
6. Submit for review. Review typically takes a few business days; you will be emailed when it is published or if changes are requested.

The same zip works for the [Microsoft Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge/) store.

### Regenerate icons

The extension icons (`src/extension/public/icons/icon-{16,48,128}.png`) are rendered from `public/favicon.svg`. To regenerate them after changing the source art, run a Chromium browser with remote debugging on port 9222 and:

```bash
node scripts/generate-extension-icons.mjs
```

## GitHub Pages Deployment

The workflow in `.github/workflows/pages.yml` builds the app and deploys `dist` to GitHub Pages on pushes to `main`.

In the repository settings, set Pages source to **GitHub Actions**. The workflow passes `VITE_BASE_PATH` as `/${{ github.event.repository.name }}/`, which matches the standard project Pages URL path. For a custom domain, set `VITE_BASE_PATH` to `/` in the workflow.

## LinkedIn Formatting Limits

LinkedIn feed posts are plain text. LinkedIn itself does not reliably preserve pasted HTML, Markdown syntax, Word document formatting, or CSS font choices, so this app converts pasted Markdown and uploaded `.docx` content into editor formatting and uses sans-serif Unicode characters for visual styling. That means formatting is visual rather than semantic, and assistive technologies may not announce it as bold or italic. LinkedIn still controls the final post font after paste.

The character counter is based on the exported clipboard text and uses a 3,000-character feed post limit. LinkedIn can change limits or count edge-case Unicode differently, so paste into LinkedIn before publishing high-stakes posts.

The desktop/mobile feed previews are client-side visual simulations. Public preview tools and guidance describe LinkedIn's collapsed feed cutoff as line-based rather than a fixed character count: about three visible lines, roughly 210 characters in a desktop-width feed column and 140 in a mobile-width column depending on line breaks, glyph widths, emojis, and user font settings. The More cutoff toggle uses those thresholds as an estimate. LinkedIn does not provide a public browser-only API for showing a real logged-in feedcard preview without posting, and the static GitHub Pages app cannot authenticate to LinkedIn or call LinkedIn APIs directly.

## License

MIT. See [LICENSE](LICENSE).
