# OmniPost

Draft a post once and see it formatted for every platform at the same time. The main editor uses TipTap for word-processor-style editing; a live preview rail shows what your post looks like on **LinkedIn, X, Bluesky, Threads, Facebook, and Instagram**, each with its own character limit, counting rule, and formatting limits applied. Edit inside any preview to tailor that platform's version, then copy it (or open that platform's composer) in one click.

It ships in two forms:

- **Web app** — the multi-platform editor. Live at https://markrussinovich.github.io/OmniPost/
- **Browser extension** — runs on LinkedIn itself. Clicking **Start a post** opens the formatter *as* the composer; its **Post** button writes the formatted text into LinkedIn's native composer and submits through LinkedIn's own Post flow. The extension remains LinkedIn-specific. See [Browser Extension](#browser-extension).

<p align="center">
  <img src="docs/screenshot.png" alt="OmniPost screenshot" width="640">
</p>

This is not an official app of any platform. Drafts stay in your browser; the extension only acts on LinkedIn when you click Post.

## Features

- **Multi-platform live previews.** Toggle platforms on/off with chips; enabled platforms appear as feed-style cards in the right-hand rail and update as you type.
- **Per-platform rules.** LinkedIn (3,000 chars, styled Unicode), X (280, weighted counting — URLs count as 23, an estimate), Bluesky (300, grapheme-cluster counting), Threads (500), Facebook (long-form with a "See more" cutoff), Instagram (2,200, with a warning that captions don't render clickable links).
- **Fork-on-edit.** Each preview mirrors the main draft until you edit it; the first edit "forks" that platform into a customized version (Customized badge) with a one-click re-sync back to the main draft. Hiding a customized platform keeps its customization dormant until you re-enable it.
- **Copy per platform.** Every card has Copy (platform-ready text) and, where supported, Copy & open — which copies and opens that platform's composer pre-filled (X, Bluesky, Threads).
- **Optional AI assist.** Connect an LLM endpoint (Anthropic Claude, or any OpenAI-compatible endpoint that allows browser/CORS calls) via the gear icon. The AI can write or improve the main draft, rewrite a single platform on demand ("Adapt with AI"), and — with auto-fit enabled — automatically rewrite any over-limit platform to fit, ~3 seconds after you stop typing. AI-fitted cards show an **AI** badge and can be re-synced to the master; manual edits always take precedence over AI versions. The API key is stored only in your browser, and calls go directly from the browser to your endpoint.
- TipTap rich text editor with toolbar controls and keyboard shortcuts.
- Sans-serif Unicode bold, italic, bold italic, code, experimental underline, and experimental strikethrough export (LinkedIn); plain text for platforms where styled Unicode hurts reach/accessibility.
- Nested bullet and numbered lists with non-breaking-space indentation.
- Blockquotes exported as indented plain text, and horizontal dividers exported as plain divider lines.
- Links export as readable label plus URL, for example `Read more (https://example.com)`.
- Hashtags remain plain text so platforms have the best chance to recognize them.
- Mentions: write `@[Name]` to tag people; copying flattens to plain `@Name`, and posting through the LinkedIn extension resolves tokens into real LinkedIn mentions (see [Mentions](#mentions)).
- Searchable emoji picker with emoji-safe export behavior.
- Pasted Markdown converts to formatted draft text for common inline marks, links, headings, fenced code, lists, blockquotes, and dividers.
- Pasted Word/Office HTML is cleaned into editor-friendly content while preserving common inline styling where possible.
- Upload or drag `.txt`, `.md`, `.markdown`, or `.docx` files into the draft editor.
- A LinkedIn-style desktop/mobile feed preview of the main draft with an estimated "more" cutoff toggle.
- One-click copy with a fallback for browsers that block the Clipboard API.
- Local draft autosave (including per-platform customizations and enabled platforms), reset/recovery behavior, and saved drafts.
- Extension: one-click publish through LinkedIn's native composer, with the native composer kept hidden so the formatter feels like the real post box.
- Extension: attach images (up to 20) or a single video; media is handed to LinkedIn's own upload flow when you click Post.
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
- On **Post**, the script briefly makes the hidden composer focusable, hands any attached images/videos to LinkedIn's media upload input (confirming the media editor's **Next** step), inserts the exported text (resolving `@[Name]` mention tokens through the composer's mention typeahead), waits for LinkedIn's link preview card when the text contains a URL, waits for LinkedIn's Post button to enable, clicks it, and confirms the composer closed.
- A service worker (`src/extension/public/background.js`) re-injects the script if you click the toolbar icon on a LinkedIn tab.

### Mentions

Write `@[Name]` in the draft — for example `@[Scott Hanselman]` — to mention someone. The editor shows the token as plain text; the preview and character count show it flattened as `@Name`.

- **Posting through the extension** resolves each token into a real mention: the bridge types `@name` into LinkedIn's hidden composer one character at a time, waits for LinkedIn's mention typeahead, and clicks the entry whose name matches exactly (case-insensitive). LinkedIn ranks your closest connection first when several people share a name. The published post shows a clickable mention rendered as the person's name (LinkedIn drops the `@` and brackets), and they receive the usual mention notification. Each mention adds a couple of seconds to posting while the typeahead resolves.
- **If nothing matches exactly** (a typo, or someone LinkedIn's typeahead will not surface), the token degrades to plain `@name` text in the post. A near-match is never clicked, so the wrong person cannot be mentioned.
- **Copy for LinkedIn and the web app** always flatten tokens to plain `@Name` text. Pasted text can never become a real mention — LinkedIn only creates mention entities through its own typeahead — so after pasting, retype `@Name` in LinkedIn's composer and pick from the dropdown to mention manually.
- Mention tokens stay unstyled inside bold or italic text, both because styled (Unicode) names would never match the typeahead and because LinkedIn renders mentions unstyled anyway.

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
