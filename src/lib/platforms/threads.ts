import type { PlatformSpec } from './types';

export const threadsSpec: PlatformSpec = {
  id: 'threads',
  label: 'Threads',
  brandColor: '#000000',
  charLimit: 500,
  warningThreshold: 465,
  counting: 'nfc-codepoints',
  allowUnicodeStyling: false,
  // Feed collapses early (~175 chars); front-load the hook.
  truncation: {
    desktop: { visibleLines: 4, approximateCharacters: 175, approximateCharactersPerLine: 45 },
  },
  truncationLabel: '... more',
  capabilities: {
    copy: true,
    imageAttachments: true,
    // Threads migrated to threads.com (April 2025); threads.net still redirects.
    openComposer: {
      // Threads' intent endpoint turns emoji in the `text` query param into "?".
      // When the post contains emoji, open the composer empty and rely on the
      // clipboard (Copy & open copies the full text first); otherwise pre-fill.
      url: (text) =>
        /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(text)
          ? 'https://www.threads.com/intent/post'
          : `https://www.threads.com/intent/post?text=${encodeURIComponent(text)}`,
      prefillsText: true,
    },
  },
  warnings: [],
  // Threads unfurls a large image card with title and domain.
  linkPreview: { layout: 'large', showDescription: false },
};
