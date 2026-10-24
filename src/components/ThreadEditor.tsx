import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, ExternalLink, Trash2 } from 'lucide-react';

import { copyPlainText } from '../lib/clipboard';
import { lastUrlInText } from '../lib/linkPreview';
import type { LinkPreview } from '../lib/media';
import type { PlatformSpec } from '../lib/platforms/types';
import { renderThreadPost, type PostThread } from '../lib/postThreads';
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
  const [activePostId, setActivePostId] = useState<string | null>(thread.posts[0]?.id ?? null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusPost = useRef<string | null>(null);
  const latestThread = useRef(thread);
  latestThread.current = thread;
  const copyRequest = useRef(0);
  const activeIndex = Math.max(0, thread.posts.findIndex((post) => post.id === activePostId));
  const activePost = thread.posts[activeIndex];
  const activeRender = activePost ? renderThreadPost(thread, activeIndex, spec) : null;
  useEffect(() => () => {
    copyRequest.current++;
    if (timer.current) clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    if (!thread.posts.some((post) => post.id === activePostId)) {
      setActivePostId(thread.posts[0]?.id ?? null);
    }
  }, [activePostId, thread.posts]);
  useEffect(() => {
    if (focusPost.current) {
      document.getElementById(`thread-${spec.id}-${focusPost.current}`)?.focus();
      focusPost.current = null;
    }
  }, [thread.posts, spec.id]);

  async function copy(id: string, text: string, openComposer = false) {
    const request = ++copyRequest.current;
    const sourcePost = thread.posts.find((post) => post.id === id);
    const sourceIndex = thread.posts.findIndex((post) => post.id === id);
    const subject = `Post ${sourceIndex + 1}`;
    setCopying(true);
    setCopyStatus(null);
    if (timer.current) clearTimeout(timer.current);
    let copied = false;
    try {
      await copyPlainText(text);
      if (request !== copyRequest.current) return;
      copied = true;
      const composer = spec.capabilities.openComposer;
      if (openComposer && composer) {
        const composerWindow = window.open(composer.url(text), '_blank');
        if (!composerWindow) throw new Error('The composer window was blocked.');
        composerWindow.opener = null;
      }
      setCopyStatus(`${subject} copied!`);
    } catch {
      if (request !== copyRequest.current) return;
      setCopyStatus(copied ? `${subject} copied; open failed` : 'Copy failed');
    }
    if (request !== copyRequest.current) return;
    setCopying(false);
    const posts = latestThread.current.posts;
    const index = posts.findIndex((post) => post.id === id);
    if (copied && index >= 0 && posts[index] === sourcePost) {
      setActivePostId((current) => current === id ? posts[(index + 1) % posts.length].id : current);
    }
    timer.current = setTimeout(() => setCopyStatus(null), 1800);
  }

  function flip(direction: -1 | 1) {
    setActivePostId(thread.posts[(activeIndex + direction + thread.posts.length) % thread.posts.length].id);
  }

  return (
    <div className="post-thread" role="group" aria-roledescription="carousel" aria-label={`${spec.label} thread`}>
      {spec.disclaimer ? <p className="post-thread-hint">{spec.disclaimer}</p> : null}
      {activePost ? (
        <div className="post-thread-navigation">
          <span className="platform-card-actions">
            <button type="button" className="card-icon-button" disabled={thread.posts.length < 2} aria-label={`Previous ${spec.label} thread post`} onClick={() => flip(-1)}>
              <ChevronLeft aria-hidden="true" size={16} />
            </button>
            <label htmlFor={`thread-${spec.id}-${activePost.id}`} aria-live="polite">Post {activeIndex + 1} of {thread.posts.length}</label>
            <button type="button" className="card-icon-button" disabled={thread.posts.length < 2} aria-label={`Next ${spec.label} thread post`} onClick={() => flip(1)}>
              <ChevronRight aria-hidden="true" size={16} />
            </button>
          </span>
          <span className="platform-card-actions">
            <button type="button" className="card-icon-button" disabled={thread.posts.length === 1} aria-label={`Remove post ${activeIndex + 1}`} onClick={() => {
              const next = thread.posts[activeIndex + 1] ?? thread.posts[activeIndex - 1];
              focusPost.current = next?.id ?? null;
              setActivePostId(next?.id ?? null);
              onChange({ ...thread, posts: thread.posts.filter((entry) => entry.id !== activePost.id) });
            }}>
              <Trash2 aria-hidden="true" size={14} />
            </button>
          </span>
        </div>
      ) : null}
      <ol className="post-thread-list">
        {thread.posts.map((post, index) => {
          const rendered = renderThreadPost(thread, index, spec);
          const previewUrl = showLinkPreviews && spec.linkPreview ? lastUrlInText(rendered.text) : undefined;
          const empty = !post.text.trim();
          return (
            <li key={post.id} hidden={index !== activeIndex} className={`post-thread-post is-${rendered.summary.status}`} aria-label={`${spec.label} post ${index + 1}`}>
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
            </li>
          );
        })}
      </ol>
      {activePost && activeRender ? (
        <div className="platform-card-buttons post-thread-copy-actions">
          <button type="button" className="card-copy-button" disabled={copying || !activePost.text.trim()} aria-label={`Copy post ${activeIndex + 1}`} onClick={() => void copy(activePost.id, activeRender.text)}>
            <Copy aria-hidden="true" size={15} /> Copy post
          </button>
          {spec.capabilities.openComposer ? (
            <button type="button" className="card-copy-button" disabled={copying || !activePost.text.trim()} aria-label={`Copy & open post ${activeIndex + 1}`} onClick={() => void copy(activePost.id, activeRender.text, true)}>
              <ExternalLink aria-hidden="true" size={15} /> Copy &amp; open
            </button>
          ) : null}
        </div>
      ) : null}
      {copyStatus ? <p className="post-thread-copy-status" role="status">{copyStatus}</p> : null}
    </div>
  );
}
