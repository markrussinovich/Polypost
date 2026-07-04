import type { PlatformSpec } from './types';

export const facebookSpec: PlatformSpec = {
  id: 'facebook',
  label: 'Facebook',
  brandColor: '#1877f2',
  // Facebook's hard cap is huge; the practical concern is the feed "See more" cut.
  charLimit: 63206,
  warningThreshold: 60000,
  counting: 'nfc-codepoints',
  allowUnicodeStyling: false,
  // Layout-dependent estimates: ~477 chars on desktop, ~125 on mobile.
  truncation: {
    desktop: { visibleLines: 5, approximateCharacters: 477, approximateCharactersPerLine: 90 },
    mobile: { visibleLines: 2, approximateCharacters: 125, approximateCharactersPerLine: 55 },
  },
  truncationLabel: 'See more',
  capabilities: {
    copy: true,
    imageAttachments: true,
    // Facebook's sharer only accepts a URL, not arbitrary text, so we just open
    // the composer; the post text is on the clipboard for pasting.
    openComposer: { url: () => 'https://www.facebook.com/', prefillsText: false },
  },
  warnings: [],
  // Facebook shows a large image card with the domain, title, and description.
  linkPreview: { layout: 'large', showDescription: true },
};
