// Shared help copy, grouped into sections. Rendered inside a <details> by
// HelpPanel (used by the browser extension) and inside a modal by HelpModal
// (used by the web app).
export function HelpContent() {
  return (
    <div className="help-sections">
      <section className="help-section">
        <h3>Previews &amp; customization</h3>
        <ul className="help-list">
          <li>
            Write once in the main editor. Each enabled platform shows a live preview with that platform's character
            limit, counting rule, and formatting applied.
          </li>
          <li>
            Edit inside a preview to customize it for that platform. The card shows a Customized badge and a re-sync
            button that drops the customization and follows the main draft again.
          </li>
          <li>
            Cards with more than one feed cutoff (LinkedIn) offer a Desktop/Mobile toggle; the "more…"/"less…" markers
            estimate the collapsed feed view. Cutoffs vary by device and layout, so treat them as approximations.
          </li>
          <li>Previews are visual approximations; real feed-card rendering requires each platform's APIs this static app cannot call.</li>
        </ul>
      </section>

      <section className="help-section">
        <h3>AI assistant (optional)</h3>
        <ul className="help-list">
          <li>
            Open the gear icon to connect an LLM endpoint — Anthropic (Claude), Google Gemini, or any OpenAI-compatible
            endpoint that allows browser/CORS requests. Use Test connection to verify it works. Your API key is stored
            only in this browser.
          </li>
          <li>Ask the AI to write or improve the main draft from the bar above the editor.</li>
          <li>
            Give the AI material to use as its context with "Reference sources for AI": add a .txt/.md/.docx file, a
            URL, or pasted text. Sources are context only — they're never posted. If a URL can't be fetched (many sites
            block it), paste the page text into the prompt the card shows.
          </li>
          <li>Use "Adapt with AI" on a card to rewrite the post for that platform on demand.</li>
          <li>
            With auto-fit on, any platform over its limit is rewritten automatically about 3 seconds after you stop
            typing (shown with an AI badge; re-sync drops it). Fitted versions are re-checked against the limit and
            regenerated if still too long.
          </li>
          <li>Add Style guidance in settings to steer the voice (e.g. "keep it light-hearted with a bit of humor").</li>
        </ul>
      </section>

      <section className="help-section">
        <h3>Per-platform formatting</h3>
        <ul className="help-list">
          <li>
            LinkedIn keeps styled Unicode (bold/italic/underline). X, Bluesky, Threads, Facebook, and Instagram show
            plain text, since styled Unicode counts against limits and hurts reach and screen-reader accessibility.
          </li>
          <li>X counts URLs as 23 and some characters as 2 (its count is an estimate); Bluesky counts by grapheme clusters; Instagram captions can't render clickable links.</li>
          <li>Bold, italic, and underline export as Unicode text on LinkedIn, not selectable font styling.</li>
          <li>Nested lists and blockquotes use non-breaking-space indentation because posts are plain text; dividers export as a plain line.</li>
          <li>Emoji stay as regular emoji; underline and strikethrough do not add combining marks to them. Strikethrough is experimental and may render differently across devices.</li>
          <li>Hashtags stay plain so platforms have the best chance to recognize them.</li>
          <li>Links export as readable text plus URL because custom pasted anchor text is not supported in posts.</li>
          <li>Pasted Markdown converts to formatted draft text for common inline styles, links, headings, fenced code, lists, blockquotes, and horizontal rules.</li>
        </ul>
      </section>

      <section className="help-section">
        <h3>Images &amp; links</h3>
        <ul className="help-list">
          <li>
            Add an image or a link once in "Images &amp; links" below the editor and reuse it everywhere — no need to
            re-add it per platform.
          </li>
          <li>
            Link URLs fold into each card's text and count against that platform's limit (on X each counts as 23), so
            Copy and Copy &amp; open include them automatically. Links are saved to this browser.
          </li>
          <li>
            For an image, use <strong>Copy image</strong> to put the picture on your clipboard and paste it straight into
            the LinkedIn composer, or download / drag the file into any other composer. Images are kept for this session
            only. (Videos can't be copied by a web page, so they're not included — post video through the LinkedIn
            extension, which attaches it for you.)
          </li>
        </ul>
      </section>

      <section className="help-section">
        <h3>Mentions</h3>
        <ul className="help-list">
          <li>
            Mention people as @[Name], for example @[Scott Hanselman]. The editor shows the token as plain text; the
            preview and character count show it as @Name.
          </li>
          <li>
            Posting through the extension resolves each @[Name] through LinkedIn's mention typeahead into a real,
            clickable mention. Only an exact name match is used; if nothing matches, the text stays plain @Name rather
            than mentioning the wrong person.
          </li>
          <li>
            Copy flattens @[Name] to plain @Name: pasted text can't become a real mention. To mention after pasting,
            retype @Name in the platform's composer and pick the person from the dropdown.
          </li>
        </ul>
      </section>

      <section className="help-section">
        <h3>Copying &amp; posting</h3>
        <ul className="help-list">
          <li>
            Each preview card has Copy (platform-ready text) and, where supported, Copy &amp; open, which copies and
            opens that platform's composer (pre-filled on X, Bluesky, and Threads). Facebook and Instagram are
            copy-only or open to the site, since they don't accept pre-filled caption text.
          </li>
          <li>
            When posting through the extension, LinkedIn expands the first URL into its usual link preview card. Attached
            images or video suppress the preview, as on LinkedIn itself.
          </li>
        </ul>
      </section>

      <section className="help-section">
        <h3>Drafts &amp; shortcuts</h3>
        <ul className="help-list">
          <li>Saved drafts (including per-platform customizations and your enabled platforms) are local to this browser only.</li>
          <li>Keyboard shortcuts include Ctrl+B, Ctrl+I, Ctrl+Z, and Ctrl+Y, and work in both the main editor and the platform previews.</li>
        </ul>
      </section>
    </div>
  );
}
