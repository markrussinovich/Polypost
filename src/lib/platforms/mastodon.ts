import type { PlatformSpec } from './types';

export const mastodonSpec: PlatformSpec = {
  id: 'mastodon',
  label: 'Mastodon',
  brandColor: '#6364ff',
  // 500 is the default; individual instances can raise or lower it.
  charLimit: 500,
  warningThreshold: 465,
  // Code points with links counted as a flat 23 (Mastodon's rule).
  counting: 'mastodon',
  // Vanilla Mastodon posts are plain text — no Markdown or styled-Unicode rendering.
  allowUnicodeStyling: false,
  truncation: null,
  truncationLabel: '',
  capabilities: {
    // Copy only: Mastodon is federated, so there is no universal compose/intent URL
    // (it would need the user's home-instance domain).
    copy: true,
    imageAttachments: true,
  },
  warnings: [],
  // Mastodon renders a compact card: small thumbnail on the left, title,
  // description, and domain on the right.
  linkPreview: { layout: 'thumbnail', showDescription: true },
  disclaimer: 'Links count as 23 characters. 500 is the default limit and can vary by instance.',
};
