import type { EditorNode } from '../exportText';
import type { PlatformId } from '../platforms/types';

export interface AiProposal {
  before: EditorNode;
  after: EditorNode;
  master: EditorNode;
  platform?: PlatformId;
  instruction?: string;
  truncated: boolean;
}
