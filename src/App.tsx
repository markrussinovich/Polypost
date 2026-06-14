import { useEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, Moon, Settings, Sun } from 'lucide-react';

import { AiAssist } from './components/AiAssist';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DraftHistoryPanel } from './components/DraftHistoryPanel';
import { EditorShell } from './components/EditorShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HelpModal } from './components/HelpModal';
import { LlmSettings } from './components/LlmSettings';
import { MediaTray } from './components/MediaTray';
import { OmniPostMark } from './components/OmniPostMark';
import { PlatformRail } from './components/PlatformRail';
import { PlatformToggleChips } from './components/PlatformToggleChips';
import { loadTheme, saveTheme, type Theme } from './lib/theme';
import { selectAutofit } from './lib/ai/autofit';
import { isLlmReady, loadLlmConfig, saveLlmConfig, type LlmConfig } from './lib/ai/config';
import { docToPlainText } from './lib/ai/docText';
import { buildSourcesBlock, loadSources, saveSources, type Source } from './lib/ai/sources';
import {
  linkUrls,
  loadAttachments,
  revokeAttachment,
  saveAttachments,
  type Attachment,
} from './lib/media';
import { markdownToTipTap } from './lib/markdownToTipTap';
import { generateFit } from './lib/ai/fit';
import { generateText } from './lib/ai/llmClient';
import { buildAuthorRequest } from './lib/ai/prompts';
import { APP_NAME } from './lib/constants';
import type { EditorNode } from './lib/exportText';
import {
  DEFAULT_ENABLED_PLATFORMS,
  PLATFORMS,
  PLATFORMS_BY_ID,
  renderForPlatform,
} from './lib/platforms';
import type { PlatformId, PlatformRender } from './lib/platforms/types';
import {
  deleteDraftSnapshot,
  loadDraftHistory,
  loadWorkspace,
  saveDraftSnapshot,
  saveWorkspace,
  type DraftSnapshot,
} from './lib/storage';
import {
  applyMasterEdit,
  applyPaneEdit,
  dormantPlatforms,
  resyncPlatform,
  togglePlatform,
  type Workspace,
} from './lib/workspace';

const AUTOFIT_IDLE_MS = 3000;

// Start blank rather than with sample content; the editor shows its placeholder.
const EMPTY_DOCUMENT: EditorNode = { type: 'doc', content: [{ type: 'paragraph' }] };

function App() {
  const [initialLoad] = useState(loadWorkspace);
  const [workspace, setWorkspace] = useState<Workspace>(() => ({
    master: initialLoad.workspace?.master ?? EMPTY_DOCUMENT,
    overrides: initialLoad.workspace?.overrides ?? {},
    enabledPlatforms: initialLoad.workspace?.enabledPlatforms ?? DEFAULT_ENABLED_PLATFORMS,
  }));
  const [editorVersion, setEditorVersion] = useState(0);
  // Bumped on every master content change; keys non-forked pane editors so they
  // reseed from the updated master.
  const [masterVersion, setMasterVersion] = useState(0);
  const [activePaneEditor, setActivePaneEditor] = useState<PlatformId | null>(null);
  const [draftHistory, setDraftHistory] = useState<DraftSnapshot[]>(loadDraftHistory);
  const [storageNotice, setStorageNotice] = useState<string | null>(() => initialLoad.error ?? null);

  // AI state. aiVersions holds session-only LLM-fitted versions (not persisted);
  // they take effect only for platforms the user hasn't manually forked.
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(loadLlmConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [resyncTarget, setResyncTarget] = useState<PlatformId | null>(null);
  const [aiVersions, setAiVersions] = useState<Map<PlatformId, EditorNode>>(() => new Map());
  const [generating, setGenerating] = useState<Set<PlatformId>>(() => new Set());
  const [aiError, setAiError] = useState<string | null>(null);
  const [authorBusy, setAuthorBusy] = useState(false);
  const [authorError, setAuthorError] = useState<string | null>(null);

  // Reference material handed to the AI as background (persisted), and shared
  // media/links surfaced on every platform card (links persisted, files session-only).
  const [sources, setSources] = useState<Source[]>(loadSources);
  const [attachments, setAttachments] = useState<Attachment[]>(loadAttachments);

  const aiReady = isLlmReady(llmConfig);

  const aiVersionsRef = useRef(aiVersions);
  useEffect(() => {
    aiVersionsRef.current = aiVersions;
  }, [aiVersions]);
  const fitAbortRef = useRef<AbortController | null>(null);

  // Apply + persist the color theme.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    saveTheme(theme);
  }, [theme]);

  // Persist the whole workspace whenever it changes (debounce-free, as the
  // single-document autosave was). saveWorkspace is idempotent.
  useEffect(() => {
    const result = saveWorkspace(workspace);

    if (!result.ok) {
      setStorageNotice(result.message);
    }
  }, [workspace]);

  // Persist AI sources and shared links (file attachments are session-only and
  // ignored by saveAttachments).
  useEffect(() => {
    saveSources(sources);
  }, [sources]);

  useEffect(() => {
    saveAttachments(attachments);
  }, [attachments]);

  // One render + seed document per enabled platform. The document each platform
  // renders/edits from: a user fork wins, then an AI-fitted version, then master.
  const sharedLinkUrls = useMemo(() => linkUrls(attachments), [attachments]);

  const { platformRenders, platformDocuments } = useMemo(() => {
    const renders = new Map<PlatformId, PlatformRender>();
    const documents = new Map<PlatformId, EditorNode>();

    for (const id of workspace.enabledPlatforms) {
      const spec = PLATFORMS_BY_ID[id];

      if (spec) {
        const doc = workspace.overrides[id] ?? aiVersions.get(id) ?? workspace.master;
        documents.set(id, doc);
        renders.set(id, renderForPlatform(doc, spec, { linkUrls: sharedLinkUrls }));
      }
    }

    return { platformRenders: renders, platformDocuments: documents };
  }, [workspace, aiVersions, sharedLinkUrls]);

  const enabledSpecs = PLATFORMS.filter((spec) => workspace.enabledPlatforms.includes(spec.id));
  const forkedIds = useMemo(() => new Set(Object.keys(workspace.overrides) as PlatformId[]), [workspace.overrides]);
  const aiAdaptedIds = useMemo(() => {
    const ids = new Set<PlatformId>();
    for (const id of aiVersions.keys()) {
      if (!(id in workspace.overrides)) {
        ids.add(id);
      }
    }
    return ids;
  }, [aiVersions, workspace.overrides]);
  const dormant = dormantPlatforms(workspace);

  // Auto-fit: after a typing pause, rewrite enabled, over-limit, non-forked
  // platforms to fit, and drop AI versions that no longer apply.
  useEffect(() => {
    if (!aiReady || !llmConfig.autoFit) {
      return;
    }

    const handle = window.setTimeout(() => {
      void runAutofit();
    }, AUTOFIT_IDLE_MS);

    return () => window.clearTimeout(handle);
    // runAutofit reads the latest workspace via this effect's closure; it re-runs
    // (resetting the timer) on every master/platform/override/config/link change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.master, workspace.enabledPlatforms, workspace.overrides, llmConfig, sharedLinkUrls]);

  async function runAutofit() {
    fitAbortRef.current?.abort();
    const controller = new AbortController();
    fitAbortRef.current = controller;

    const selection = selectAutofit({
      master: workspace.master,
      enabledPlatforms: workspace.enabledPlatforms,
      userForkedIds: new Set(Object.keys(workspace.overrides) as PlatformId[]),
      aiVersionIds: new Set(aiVersionsRef.current.keys()),
      linkUrls: sharedLinkUrls,
    });

    if (selection.toClear.length > 0) {
      setAiVersions((prev) => {
        const next = new Map(prev);
        selection.toClear.forEach((id) => next.delete(id));
        return next;
      });
    }

    if (selection.toFit.length === 0) {
      return;
    }

    const masterText = docToPlainText(workspace.master);
    setGenerating((prev) => new Set([...prev, ...selection.toFit]));
    setAiError(null);

    await Promise.all(
      selection.toFit.map(async (id) => {
        const spec = PLATFORMS_BY_ID[id];

        try {
          // generateFit re-checks the length and regenerates automatically; we
          // always show its best result without surfacing an over-limit notice.
          const result = await generateFit({ config: llmConfig, spec, masterText, style: llmConfig.stylePrompt, signal: controller.signal, linkUrls: sharedLinkUrls });

          if (!controller.signal.aborted) {
            setAiVersions((prev) => new Map(prev).set(id, result.doc));
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setAiError(`${spec.label}: ${error instanceof Error ? error.message : 'AI request failed.'}`);
          }
        } finally {
          setGenerating((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }),
    );
  }

  async function handleFit(id: PlatformId) {
    const spec = PLATFORMS_BY_ID[id];

    if (!aiReady || !spec) {
      return;
    }

    setGenerating((prev) => new Set(prev).add(id));
    setAiError(null);

    try {
      const result = await generateFit({ config: llmConfig, spec, masterText: docToPlainText(workspace.master), style: llmConfig.stylePrompt, linkUrls: sharedLinkUrls });
      setAiVersions((prev) => new Map(prev).set(id, result.doc));
    } catch (error) {
      setAiError(`${spec.label}: ${error instanceof Error ? error.message : 'AI request failed.'}`);
    } finally {
      setGenerating((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleAuthor(instruction: string) {
    if (!aiReady) {
      return;
    }

    setAuthorBusy(true);
    setAuthorError(null);

    try {
      const { system, prompt } = buildAuthorRequest(instruction, docToPlainText(workspace.master), llmConfig.stylePrompt, buildSourcesBlock(sources));
      const text = await generateText({ config: llmConfig, system, prompt });
      const doc = markdownToTipTap(text);
      setWorkspace((prev) => applyMasterEdit(prev, doc));
      setAiVersions(new Map()); // master replaced — drop stale AI versions
      setEditorVersion((version) => version + 1);
      setMasterVersion((version) => version + 1);
    } catch (error) {
      setAuthorError(error instanceof Error ? error.message : 'AI request failed.');
    } finally {
      setAuthorBusy(false);
    }
  }

  function handleSaveSettings(config: LlmConfig) {
    setLlmConfig(config);
    saveLlmConfig(config);
    setShowSettings(false);
  }

  function handleAddSource(source: Source) {
    setSources((prev) => [...prev, source]);
  }

  function handleUpdateSource(id: string, source: Source) {
    setSources((prev) => prev.map((existing) => (existing.id === id ? source : existing)));
  }

  function handleRemoveSource(id: string) {
    setSources((prev) => prev.filter((source) => source.id !== id));
  }

  function handleAddAttachment(attachment: Attachment) {
    setAttachments((prev) => [...prev, attachment]);
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((attachment) => attachment.id === id);

      if (target) {
        revokeAttachment(target);
      }

      return prev.filter((attachment) => attachment.id !== id);
    });
  }

  function handleMasterChange(nextMaster: EditorNode) {
    setWorkspace((prev) => applyMasterEdit(prev, nextMaster));
    setMasterVersion((version) => version + 1);
  }

  function handleReplaceDocument(nextMaster: EditorNode) {
    setWorkspace((prev) => applyMasterEdit(prev, nextMaster));
    setAiVersions(new Map());
    setEditorVersion((version) => version + 1);
    setStorageNotice(null);
  }

  function handlePaneChange(id: PlatformId, doc: EditorNode) {
    // A manual edit forks the platform; drop any AI version it supersedes.
    setWorkspace((prev) => applyPaneEdit(prev, id, doc));
    setAiVersions((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function handleStartEditing(id: PlatformId) {
    setActivePaneEditor(id);
  }

  function handleStopEditing() {
    setActivePaneEditor(null);
  }

  function clearAiVersion(id: PlatformId) {
    setAiVersions((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function handleResync(id: PlatformId) {
    // Ask via an integrated dialog rather than a browser confirm popup.
    setResyncTarget(id);
  }

  function confirmResync() {
    const id = resyncTarget;

    if (!id) {
      return;
    }

    setWorkspace((prev) => resyncPlatform(prev, id));
    clearAiVersion(id);
    setActivePaneEditor((current) => (current === id ? null : current));
    setResyncTarget(null);
  }

  function handleTogglePlatform(id: PlatformId) {
    setWorkspace((prev) => togglePlatform(prev, id));
    clearAiVersion(id);
    // Closing the pane of a platform being hidden avoids a dangling editor.
    setActivePaneEditor((current) => (current === id ? null : current));
  }

  function handleReset() {
    setWorkspace((prev) => ({ ...prev, master: EMPTY_DOCUMENT, overrides: {} }));
    setAiVersions(new Map());
    setActivePaneEditor(null);
    setEditorVersion((version) => version + 1);
    setStorageNotice(null);
  }

  function handleSaveDraftSnapshot(title: string) {
    const characterCount = renderForPlatform(workspace.master, PLATFORMS_BY_ID.linkedin).summary.count;
    const result = saveDraftSnapshot(workspace.master, title, characterCount, {
      overrides: workspace.overrides,
      enabledPlatforms: workspace.enabledPlatforms,
    });

    if (result.ok) {
      setDraftHistory(loadDraftHistory());
      setStorageNotice(null);
    } else {
      setStorageNotice(result.message);
    }
  }

  function handleRestoreDraftSnapshot(draft: DraftSnapshot) {
    setWorkspace((prev) => ({
      master: draft.document,
      overrides: draft.overrides ?? {},
      enabledPlatforms: draft.enabledPlatforms ?? prev.enabledPlatforms,
    }));
    setAiVersions(new Map());
    setActivePaneEditor(null);
    setEditorVersion((version) => version + 1);
    setStorageNotice(null);
  }

  function handleDeleteDraftSnapshot(id: string) {
    const result = deleteDraftSnapshot(id);

    if (result.ok) {
      setDraftHistory(loadDraftHistory());
      setStorageNotice(null);
    } else {
      setStorageNotice(result.message);
    }
  }

  return (
    <ErrorBoundary onReset={handleReset}>
      <main className="app-shell">
        <header className="app-header" aria-labelledby="app-title">
          <div className="brand-lockup" aria-hidden="true">
            <OmniPostMark className="brand-mark" />
          </div>
          <div className="header-copy">
            <h1 id="app-title">{APP_NAME}</h1>
            <p className="subtitle">Draft once, format for every platform. Connect an AI assistant to help write your post and tailor it to each platform's length and style.</p>
          </div>
          <div className="header-actions">
            <button type="button" className="header-icon-button" aria-label="How OmniPost works" title="Help" onClick={() => setShowHelp(true)}>
              <HelpCircle aria-hidden="true" size={18} />
            </button>
            <button
              type="button"
              className="header-icon-button"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              onClick={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
            </button>
            <button type="button" className="header-icon-button" aria-label="AI settings" title="AI settings" onClick={() => setShowSettings(true)}>
              <Settings aria-hidden="true" size={18} />
            </button>
            <a
              className="github-link"
              href="https://github.com/markrussinovich/OmniPost"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Open GitHub repository"
            >
              <svg className="github-mark" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
            </a>
          </div>
        </header>

        <PlatformToggleChips
          specs={PLATFORMS}
          enabled={workspace.enabledPlatforms}
          dormant={dormant}
          onToggle={handleTogglePlatform}
        />

        <section className="workspace-grid" aria-label={`${APP_NAME} workspace`}>
          <div className="workspace-panel editor-workspace">
            {storageNotice ? <p className="inline-alert panel-alert" role="status">{storageNotice}</p> : null}

            <AiAssist
              ready={aiReady}
              busy={authorBusy}
              error={authorError}
              onSubmit={handleAuthor}
              onOpenSettings={() => setShowSettings(true)}
              sources={sources}
              onAddSource={handleAddSource}
              onUpdateSource={handleUpdateSource}
              onRemoveSource={handleRemoveSource}
            />
            <EditorShell
              key={editorVersion}
              initialContent={workspace.master}
              onDocumentChange={handleMasterChange}
              onReplaceDocument={handleReplaceDocument}
              onReset={handleReset}
            />
            <MediaTray
              attachments={attachments}
              onAddAttachment={handleAddAttachment}
              onRemoveAttachment={handleRemoveAttachment}
            />
            <DraftHistoryPanel
              drafts={draftHistory}
              onDelete={handleDeleteDraftSnapshot}
              onRestore={handleRestoreDraftSnapshot}
              onSave={handleSaveDraftSnapshot}
            />
          </div>

          <PlatformRail
            specs={enabledSpecs}
            renders={platformRenders}
            documents={platformDocuments}
            forkedIds={forkedIds}
            aiAdaptedIds={aiAdaptedIds}
            attachments={attachments}
            generatingIds={generating}
            aiReady={aiReady}
            aiError={aiError}
            editingId={activePaneEditor}
            masterVersion={masterVersion}
            onStartEditing={handleStartEditing}
            onStopEditing={handleStopEditing}
            onPaneChange={handlePaneChange}
            onResync={handleResync}
            onFit={handleFit}
          />
        </section>
      </main>
      {showSettings ? <LlmSettings config={llmConfig} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} /> : null}
      {showHelp ? <HelpModal onClose={() => setShowHelp(false)} /> : null}
      {resyncTarget ? (
        <ConfirmDialog
          title={`Re-sync ${PLATFORMS_BY_ID[resyncTarget]?.label ?? 'platform'}?`}
          message="This discards the customized version for this platform and follows the master draft again."
          confirmLabel="Re-sync"
          onConfirm={confirmResync}
          onCancel={() => setResyncTarget(null)}
        />
      ) : null}
    </ErrorBoundary>
  );
}

export default App;
