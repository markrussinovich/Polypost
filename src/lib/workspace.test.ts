import { describe, expect, it } from 'vitest';

import type { EditorNode } from './exportText';
import {
  applyMasterEdit,
  applyPaneEdit,
  applyThreadEdit,
  documentFor,
  dormantPlatforms,
  isForked,
  resyncPlatform,
  togglePlatform,
  type Workspace,
} from './workspace';

function makeDoc(textValue: string): EditorNode {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: textValue }] }] };
}

function baseWorkspace(): Workspace {
  return { master: makeDoc('master'), overrides: {}, enabledPlatforms: ['linkedin', 'x'] };
}

describe('workspace fork-on-edit helpers', () => {
  it('non-forked platforms mirror the master', () => {
    const ws = baseWorkspace();
    expect(isForked(ws, 'x')).toBe(false);
    expect(documentFor(ws, 'x')).toEqual(ws.master);
  });

  it('a pane edit forks only that platform', () => {
    const ws = applyPaneEdit(baseWorkspace(), 'x', makeDoc('x variant'));

    expect(isForked(ws, 'x')).toBe(true);
    expect(documentFor(ws, 'x')).toEqual(makeDoc('x variant'));
    // LinkedIn is untouched and still mirrors the master.
    expect(isForked(ws, 'linkedin')).toBe(false);
    expect(documentFor(ws, 'linkedin')).toEqual(ws.master);
  });

  it('a master edit does not change a forked platform', () => {
    let ws = applyPaneEdit(baseWorkspace(), 'x', makeDoc('x variant'));
    ws = applyMasterEdit(ws, makeDoc('new master'));

    expect(documentFor(ws, 'x')).toEqual(makeDoc('x variant'));
    // A non-forked platform follows the new master.
    expect(documentFor(ws, 'linkedin')).toEqual(makeDoc('new master'));
  });

  it('resync discards the override and remirrors the master', () => {
    let ws = applyPaneEdit(baseWorkspace(), 'x', makeDoc('x variant'));
    ws = resyncPlatform(ws, 'x');

    expect(isForked(ws, 'x')).toBe(false);
    expect(documentFor(ws, 'x')).toEqual(ws.master);
  });

  it('toggling a platform off keeps its override dormant', () => {
    let ws = applyPaneEdit(baseWorkspace(), 'x', makeDoc('x variant'));
    ws = togglePlatform(ws, 'x');

    expect(ws.enabledPlatforms).not.toContain('x');
    // Override survives so re-enabling restores the customization.
    expect(ws.overrides.x).toEqual(makeDoc('x variant'));
    expect(dormantPlatforms(ws)).toEqual(['x']);

    ws = togglePlatform(ws, 'x');
    expect(ws.enabledPlatforms).toContain('x');
    expect(dormantPlatforms(ws)).toEqual([]);
  });

  it('toggling a platform on appends it without disturbing overrides', () => {
    const ws = togglePlatform(baseWorkspace(), 'bluesky');
    expect(ws.enabledPlatforms).toEqual(['linkedin', 'x', 'bluesky']);
  });

  it('keeps a customized thread through master edits and platform toggles, and clears it on resync', () => {
    const thread = { numbered: true, posts: [{ id: 'a', text: 'Thread text' }] };
    let ws = applyThreadEdit(baseWorkspace(), 'x', thread);
    expect(isForked(ws, 'x')).toBe(true);
    ws = applyMasterEdit(ws, makeDoc('New master'));
    expect(ws.threads?.x).toEqual(thread);
    ws = togglePlatform(ws, 'x');
    expect(dormantPlatforms(ws)).toEqual(['x']);
    ws = togglePlatform(ws, 'x');
    expect(ws.threads?.x).toEqual(thread);
    ws = resyncPlatform(ws, 'x');
    expect(ws.threads?.x).toBeUndefined();
    expect(isForked(ws, 'x')).toBe(false);
  });
});
