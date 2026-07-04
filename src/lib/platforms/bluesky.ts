import type { PlatformSpec } from './types';

export const blueskySpec: PlatformSpec = {
  id: 'bluesky',
  label: 'Bluesky',
  brandColor: '#1185fe',
  charLimit: 300,
  warningThreshold: 280,
  // Bluesky counts by grapheme clusters, not code points.
  counting: 'graphemes',
  allowUnicodeStyling: false,
  truncation: null,
  truncationLabel: '',
  capabilities: {
    copy: true,
    imageAttachments: true,
    openComposer: {
      url: (text) => `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`,
      prefillsText: true,
    },
  },
  warnings: [],
  // Bluesky external embeds show a large image, title, description, and domain.
  linkPreview: { layout: 'large', showDescription: true },
};
