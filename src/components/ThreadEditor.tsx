import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react';

import { copyPlainText } from '../lib/clipboard';
import { lastUrlInText } from '../lib/linkPreview';
import type { LinkPreview } from '../lib/media';
import type { PlatformSpec } from '../lib/platforms/types';
import { renderThreadPost, type PostThread } from '../lib/postThreads';
import { createDraftId } from '../lib/storage';
import { CardLinkPreview } from './CardLinkPreview';
import { CharacterMeter } from './CharacterMeter';

interface ThreadEditorProps {
  spec: PlatformSpec;
  thread: PostThread;
  onChange: (thread: PostThread) => void;
  linkPreviews: ReadonlyMap<string, LinkPreview>;
  showLinkPreviews: boolean;
}

export function ThreadEditor({ spec, thread, onChange, linkPreviews, showLinkPreviews }: ThreadEditorProps) {
  const [copyStatus, setCopyStatus] = useState<{ id: string | null; message: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusPost = useRef<string | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (focusPost.current) {
      document.getElementById(`thread-${spec.id}-${focusPost.current}`)?.focus();
      focusPost.current = null;
    }
  }, [thread.posts, spec.id]);

  async function copy(id: string | null, text: string, openComposer = false) {
    let copied = false;
    try {
      await copyPlainText(text);
      copied = true;
      const composer = spec.capabilities.openComposer;
      if (openComposer && composer) {
        const composerWindow = window.open(composer.url(text), '_blank');
        if (!composerWindow) throw new Error('The composer window was blocked.');
        composerWindow.opener = null;
      }
      setCopyStatus({ id, message: 'Copied!' });
    } catch {
      setCopyStatus({ id, message: copied ? 'Copied; open failed' : 'Copy failed' });
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyStatus(null), 1800);
  }

  function move(index: number, direction: -1 | 1) {
    const posts = [...thread.posts];
    [posts[index], posts[index + direction]] = [posts[index + direction], posts[index]];
    onChange({ ...thread, posts });
  }

  return (
    <div className="post-thread" role="group" aria-label={`${spec.label} thread`}>
      {spec.disclaimer ? <p className="post-thread-hint">{spec.disclaimer}</p> : null}
      <ol className="post-thread-list">
        {thread.posts.map((post, index) => {
          const rendered = renderThreadPost(thread, index, spec);
          const previewUrl = showLinkPreviews && spec.linkPreview ? lastUrlInText(rendered.text) : undefined;
          const empty = !post.text.trim();
          return (
            <li key={post.id} className={`post-thread-post is-${rendered.summary.status}`} aria-label={`${spec.label} post ${index + 1}`}>
              <div className="post-thread-post-header">
                <label htmlFor={`thread-${spec.id}-${post.id}`}>Post {index + 1}</label>
                <span className="platform-card-actions">
                  <button type="button" className="card-icon-button" disabled={index === 0} aria-label={`Move post ${index + 1} up`} onClick={() => move(index, -1)}>
                    <ArrowUp aria-hidden="true" size={14} />
                  </button>
                  <button type="button" className="card-icon-button" disabled={index === thread.posts.length - 1} aria-label={`Move post ${index + 1} down`} onClick={() => move(index, 1)}>
                    <ArrowDown aria-hidden="true" size={14} />
                  </button>
                  <button type="button" className="card-icon-button" disabled={thread.posts.length === 1} aria-label={`Remove post ${index + 1}`} onClick={() => {
                    focusPost.current = thread.posts[index + 1]?.id ?? thread.posts[index - 1]?.id ?? null;
                    onChange({ ...thread, posts: thread.posts.filter((entry) => entry.id !== post.id) });
                  }}>
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                </span>
              </div>
              <textarea
                id={`thread-${spec.id}-${post.id}`}
                aria-label={`${spec.label} post ${index + 1} text`}
                rows={Math.min(12, Math.max(3, post.text.split('\n').length, Math.ceil(post.text.length / 45)))}
                value={post.text}
                onChange={(event) => onChange({
                  ...thread, posts: thread.posts.map((entry) => entry.id === post.id ? { ...entry, text: event.target.value } : entry),
                })}
              />
              <div className="post-thread-number">{index + 1}/{thread.posts.length}</div>
              {previewUrl ? <CardLinkPreview url={previewUrl} preview={linkPreviews.get(previewUrl)} spec={spec} /> : null}
              {rendered.warnings.map((warning) => <p key={warning.id} className="platform-card-warning">{warning.message}</p>)}
              {empty || rendered.summary.status === 'over' ? (
                <p className="post-thread-error" role="status">{empty ? 'This post is empty.' : 'Over the character limit. Edit this post or move text to another post; nothing has been truncated.'}</p>
              ) : null}
              <CharacterMeter summary={rendered.summary} />
              <div className="platform-card-buttons">
                <button type="button" className="card-copy-button" disabled={empty} aria-label={`Copy post ${index + 1}`} onClick={() => void copy(post.id, rendered.text)}>
                  <Copy aria-hidden="true" size={15} />
                  {copyStatus?.id === post.id ? copyStatus.message : 'Copy post'}
                </button>
                {spec.capabilities.openComposer ? (
                  <button type="button" className="card-copy-button" disabled={empty} aria-label={`Copy & open post ${index + 1}`} onClick={() => void copy(post.id, rendered.text, true)}>
                    <ExternalLink aria-hidden="true" size={15} />
                    Copy &amp; open
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="post-thread-footer">
        <button type="button" className="secondary-action" onClick={() => {
          const id = createDraftId();
          focusPost.current = id;
          onChange({ ...thread, posts: [...thread.posts, { id, text: '' }] });
        }}>
          <Plus aria-hidden="true" size={14} /> Add post
        </button>
        <button type="button" className="secondary-action" aria-label="Copy entire thread" onClick={() => void copy(null, thread.posts.map((_, index) => renderThreadPost(thread, index, spec).text).join('\n\n---\n\n'))}>
          <Copy aria-hidden="true" size={14} />
          {copyStatus?.id === null ? copyStatus.message : 'Copy entire thread'}
        </button>
      </div>
    </div>
  );
}
