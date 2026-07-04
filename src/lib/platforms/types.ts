import type { CharacterCountStatus } from '../constants';
import type { CountingMethod } from '../counting';
import type { EditorNode } from '../exportText';
import type { PreviewMode, TruncationConfig } from '../truncation';

export type PlatformId = 'linkedin' | 'x' | 'bluesky' | 'threads' | 'mastodon' | 'facebook' | 'instagram';

// A pure, stateless description of a platform's formatting rules. Deliberately
// free of React components and runtime/auth state so it can be fed verbatim to
// a future LLM prompt builder, while publishing/auth concerns stay in their own
// module. Functions here are pure transforms/predicates only.
export interface PlatformSpec {
  id: PlatformId;
  label: string;
  brandColor: string;
  charLimit: number;
  warningThreshold: number;
  counting: CountingMethod;
  // When false the exporter emits raw text instead of styled Unicode.
  allowUnicodeStyling: boolean;
  // Feed "see more" cutoff estimates, or null when the platform doesn't collapse.
  truncation: Partial<Record<PreviewMode, TruncationConfig>> | null;
  truncationLabel: string;
  capabilities: PlatformCapabilities;
  warnings: PlatformWarningRule[];
  // Shown under the character meter when the count is an approximation.
  disclaimer?: string;
  // Keep spaces in a flattened @[Name] mention ("@Scott Hanselman"). LinkedIn opts
  // in — its extension resolves the token to a real mention. By default the spaces
  // are removed ("@ScottHanselman") so handle-based platforms' autocomplete fires
  // on the whole name instead of splitting it at the space.
  keepMentionSpaces?: boolean;
  // How this platform unfurls a URL into a preview card. Data-only; the
  // card UI reads it to mirror each platform's real layout. Absent ⇒ no preview.
  linkPreview?: LinkCardStyle;
}

// Describes how a platform renders a link's unfurl card, so the preview matches
// what the user will actually see once posted.
export interface LinkCardStyle {
  // 'large' ⇒ hero image on top; 'thumbnail' ⇒ small image on the left.
  layout: 'large' | 'thumbnail';
  showDescription: boolean;
}

export interface PlatformCapabilities {
  copy: true;
  imageAttachments?: true;
  openComposer?: OpenComposerCapability;
  // publish?: PublishCapability;  // future: post via API; impl in src/lib/publishing/
}

export interface OpenComposerCapability {
  // Pure builder: post text in, composer/intent URL out.
  url: (text: string) => string;
  prefillsText: boolean;
}

export interface PlatformWarningRule {
  id: string;
  message: string;
  applies(exportedText: string, doc: EditorNode): boolean;
}

export interface PlatformCharacterSummary {
  count: number;
  limit: number;
  remaining: number;
  status: CharacterCountStatus;
}

export interface PlatformRender {
  text: string;
  summary: PlatformCharacterSummary;
  // Only the rules whose `applies` returned true for this render.
  warnings: PlatformWarningRule[];
}
