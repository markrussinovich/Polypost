import { LINKEDIN_POST_CHARACTER_LIMIT, LINKEDIN_POST_WARNING_THRESHOLD } from '../constants';
import { FEED_CUTOFF_CONFIG } from '../feedPreview';
import type { PlatformSpec } from './types';

export const LINKEDIN_COMPOSER_URL = 'https://www.linkedin.com/feed/?shareActive=true';

export const linkedinSpec: PlatformSpec = {
  id: 'linkedin',
  label: 'LinkedIn',
  brandColor: '#0a66c2',
  charLimit: LINKEDIN_POST_CHARACTER_LIMIT,
  warningThreshold: LINKEDIN_POST_WARNING_THRESHOLD,
  counting: 'nfc-codepoints',
  allowUnicodeStyling: true,
  // The extension resolves @[Name] into a real LinkedIn mention, so keep the full
  // spaced "@Display Name".
  keepMentionSpaces: true,
  truncation: {
    desktop: FEED_CUTOFF_CONFIG.desktop,
    mobile: FEED_CUTOFF_CONFIG.mobile,
  },
  truncationLabel: '...more',
  capabilities: {
    copy: true,
    imageAttachments: true,
    // The composer doesn't accept prefilled text via URL; we just open it.
    openComposer: { url: () => LINKEDIN_COMPOSER_URL, prefillsText: false },
  },
  warnings: [],
  // LinkedIn shows a compact thumbnail card with the title and domain (no description).
  linkPreview: { layout: 'thumbnail', showDescription: false },
};
