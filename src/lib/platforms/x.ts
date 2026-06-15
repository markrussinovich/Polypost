import type { PlatformSpec } from './types';

export const xSpec: PlatformSpec = {
  id: 'x',
  label: 'X',
  brandColor: '#000000',
  charLimit: 280,
  warningThreshold: 260,
  counting: 'x-weighted',
  // Styled Unicode renders on X but every styled glyph counts as 2 and hurts
  // accessibility/reach, so plain text is the default.
  allowUnicodeStyling: false,
  truncation: null,
  truncationLabel: '',
  capabilities: {
    copy: true,
    openComposer: {
      // x.com is the canonical intent host; twitter.com/intent/tweet still redirects.
      url: (text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
      prefillsText: true,
    },
  },
  warnings: [],
  disclaimer: 'Counts are an estimate: links count as 23 characters and some complex emoji may count as more.',
};
