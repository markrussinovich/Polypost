import type { PlatformSpec } from './types';
import { containsUrl } from './warnings';

export const instagramSpec: PlatformSpec = {
  id: 'instagram',
  label: 'Instagram',
  brandColor: '#e1306c',
  charLimit: 2200,
  warningThreshold: 2050,
  counting: 'nfc-codepoints',
  allowUnicodeStyling: false,
  // First ~125 characters show before "... more".
  truncation: {
    desktop: { visibleLines: 2, approximateCharacters: 125, approximateCharactersPerLine: 60 },
  },
  truncationLabel: '... more',
  // No web composer that accepts caption text; copy-only.
  capabilities: { copy: true, imageAttachments: true },
  warnings: [
    {
      id: 'instagram-links',
      message: "Instagram captions don't render clickable links — consider 'link in bio'.",
      applies: (text) => containsUrl(text),
    },
    {
      id: 'instagram-hashtags',
      message: 'Instagram allows at most 30 hashtags per post.',
      applies: (text) => (text.match(/(^|\s)#[A-Za-z0-9_]+/g)?.length ?? 0) > 30,
    },
  ],
};
