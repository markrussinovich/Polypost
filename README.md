# Polypost

Draft a post once and format it for every platform at the same time. The main editor uses TipTap for word-processor-style editing, and a live preview rail shows your post on **LinkedIn, X, Bluesky, Threads, Mastodon, Facebook, and Instagram**, each with its own character limit, counting rule, and formatting applied.

It ships in two forms:

- **Web app** — the multi-platform editor. Live at https://markrussinovich.github.io/Polypost/
- **LinkedIn browser extension** — a LinkedIn-only companion that turns LinkedIn's own composer into the editor: **Start a post** opens it in place of the native box, and **Post** publishes through LinkedIn's own flow. See [LinkedIn browser extension](#linkedin-browser-extension).

<p align="center">
  <img src="docs/screenshot.png" alt="Polypost screenshot" width="480">
</p>

This is not an official app of any platform. Drafts stay in your browser; the extension only acts on LinkedIn when you click Post.

## Using it

- **Write once, preview everywhere.** Type in the main editor and toggle the platforms you care about with the chips; each enabled platform shows a live preview card with its character count and any warnings.
- **Tailor per platform.** Edit inside a card to *fork* a platform-specific version (it gets a Customized badge), and re-sync to the main draft any time. Newlines map 1:1 like LinkedIn's composer — Enter for a new line, again for a blank line.
- **Copy or open.** Use **Copy** for platform-ready text, or **Copy & open** to launch that platform's composer pre-filled (X, Bluesky, Threads, Mastodon).
- **Mention people.** Write `@[Name]` — it shows as `@Scott Hanselman` on LinkedIn (where the extension resolves it into a real, clickable mention) and collapses to a single handle-style token like `@ScottHanselman` on X, Bluesky, Threads, and Mastodon, so their autocomplete fires on the whole name (and can match a handle) instead of splitting it at the space.
- **Add media & links once.** Use the **Images & links** tray to reuse an image or link across platforms: links fold into each platform's text and count, and an image can be copied to the clipboard to paste into LinkedIn (or downloaded / dragged into any composer).
- **Optional AI.** Connect your own LLM key (Anthropic Claude, Google Gemini, or any OpenAI-compatible endpoint) to write, adapt, and auto-fit posts — with documents or URLs as reference context. Your key stays in your browser.
- **Install it as an app.** The web app is a PWA: install it from the **Install app** button in the header (or your browser's install option) to run it in its own window and add it to your home screen or desktop. Once loaded it works **offline** for writing, editing, and managing drafts (AI and link previews still need the network), and prompts you to reload when a new version is published.

## Features

- **Live multi-platform previews** with each platform's character limit, counting rule, formatting, and warnings — LinkedIn, X, Bluesky, Threads, Mastodon, Facebook, and Instagram.
- **Fork-on-edit** per platform with one-click re-sync, plus local autosave and saved drafts.
- **`@[Name]` mentions**, highlighted in the editor and previews — kept spaced for LinkedIn (where the extension resolves them into real, clickable mentions) and collapsed to a single handle-style token elsewhere.
- **Shared images & links** — add once, reuse everywhere; *Copy image* pastes a picture straight into LinkedIn.
- **Optional, bring-your-own-key AI** — write, adapt a single platform, auto-fit over-limit posts, and feed in reference sources (files, URLs, or pasted text), with a multiline prompt box and remembered prompt history.
- **Rich-text editing** — Markdown and Word paste, file import, a searchable emoji picker, lists, and links, with LinkedIn-style Unicode styling where it helps.
- **Private by default** — drafts, settings, and API keys stay in your browser; nothing leaves it except the AI endpoint you choose to configure.
- **Installable PWA** — add it to your home screen or desktop and launch it in its own window; the app shell is cached so editing and drafts work offline, attachments are kept on-device, and a reload prompt appears when a new version ships.

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

### Progressive Web App (PWA)

`npm run build` also emits the service worker and web app manifest via [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/), making the app installable and offline-capable. PWA features (install prompt, offline caching, the update toast) are only active in the **built** app — `npm run dev` does not register a service worker — so use `npm run preview` (or the deployed site) to exercise them.

The PWA icons in `public/` (`pwa-*.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`) are rendered from `public/favicon.svg`. Regenerate them after changing the source art with:

```bash
npm run generate:icons
```

## LinkedIn browser extension

The extension is **LinkedIn-only** — it runs on, and posts to, LinkedIn and nowhere else. It turns LinkedIn's composer into the editor: clicking **Start a post** on LinkedIn opens the rich-text editor in place of the native post box. When you click **Post**, it exports LinkedIn-ready Unicode text (resolving `@[Name]` mentions through LinkedIn's typeahead into real, clickable mentions), writes it into LinkedIn's native composer behind the scenes, and clicks LinkedIn's own **Post** button. The native composer stays hidden throughout, so it feels like you are posting directly from the editor.

### How it works

- A content script (`src/extension/content-script.tsx`) runs on `linkedin.com`, mounts the formatter UI, and listens for clicks on LinkedIn's **Start a post** control.
- LinkedIn renders its composer inside a **shadow root**, so the script pierces shadow boundaries to find the composer, suppress it (CSS `visibility:hidden` while you edit, so its focus trap cannot steal focus from the formatter), and drive it.
- On **Post**, the script briefly makes the hidden composer focusable, hands any attached images/videos to LinkedIn's media upload input (confirming the media editor's **Next** step), inserts the exported text (resolving `@[Name]` mention tokens through the composer's mention typeahead), waits for LinkedIn's link preview card when the text contains a URL, waits for LinkedIn's Post button to enable, clicks it, and confirms the composer closed.
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

### Regenerate icons

The extension icons (`src/extension/public/icons/icon-{16,48,128}.png`) are rendered from `public/favicon.svg`. To regenerate them after changing the source art, run a Chromium browser with remote debugging on port 9222 and:

```bash
node scripts/generate-extension-icons.mjs
```

## GitHub Pages Deployment

The workflow in `.github/workflows/pages.yml` builds the app and deploys `dist` to GitHub Pages on pushes to `main`.

In the repository settings, set Pages source to **GitHub Actions**. The workflow passes `VITE_BASE_PATH` as `/${{ github.event.repository.name }}/`, which matches the standard project Pages URL path. For a custom domain, set `VITE_BASE_PATH` to `/` in the workflow.

## License

MIT. See [LICENSE](LICENSE).
