import { useState } from 'react';
import { AlertTriangle, Check, Loader, X } from 'lucide-react';

import { PROVIDER_DEFAULTS, PROVIDER_LABELS, isLlmReady, type LlmConfig, type LlmProvider } from '../lib/ai/config';
import { testConnection } from '../lib/ai/llmClient';
import { useEscape } from '../lib/useEscape';

interface LlmSettingsProps {
  config: LlmConfig;
  onSave: (config: LlmConfig) => void;
  onClose: () => void;
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

const PROVIDER_ORDER: LlmProvider[] = ['anthropic', 'openai', 'gemini'];

export function LlmSettings({ config, onSave, onClose }: LlmSettingsProps) {
  const [draft, setDraft] = useState<LlmConfig>(config);
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  useEscape(onClose);

  function update(patch: Partial<LlmConfig>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setTest({ status: 'idle' });
  }

  function handleProviderChange(provider: LlmProvider) {
    // Reset URL/model to the provider's defaults only if they still match the
    // previous provider's defaults (don't clobber user-customized values).
    const prevDefaults = PROVIDER_DEFAULTS[draft.provider];
    const nextDefaults = PROVIDER_DEFAULTS[provider];
    update({
      provider,
      baseUrl: draft.baseUrl === prevDefaults.baseUrl ? nextDefaults.baseUrl : draft.baseUrl,
      model: draft.model === prevDefaults.model ? nextDefaults.model : draft.model,
    });
  }

  async function handleTest() {
    setTest({ status: 'testing' });
    const result = await testConnection({ ...draft, enabled: true });
    if (result.ok) {
      setDraft((prev) => ({ ...prev, enabled: true }));
    }
    setTest({ status: result.ok ? 'ok' : 'error', message: result.message });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSave(draft);
  }

  // The test only needs endpoint/model/key — not the enabled flag.
  const canTest = isLlmReady({ ...draft, enabled: true });
  // Auto-fit can only run when AI is enabled AND an endpoint/model/key is set, so
  // the toggle is disabled otherwise.
  const autofitAvailable = draft.enabled && canTest;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="llm-settings-title" onMouseDown={onClose}>
      <form className="modal-card" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2 id="llm-settings-title">AI assistant</h2>
          <button type="button" className="card-icon-button" aria-label="Close settings" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <p className="modal-hint">
          Connect an LLM endpoint to help write posts and auto-fit them to each platform's limit. Your key is stored only in
          this browser.
        </p>

        <label className="field-row toggle-row">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
          <span>Enable AI features</span>
        </label>

        <label className="field-row">
          <span>Provider</span>
          <select value={draft.provider} onChange={(event) => handleProviderChange(event.target.value as LlmProvider)}>
            {PROVIDER_ORDER.map((provider) => (
              <option key={provider} value={provider}>
                {PROVIDER_LABELS[provider]}
              </option>
            ))}
          </select>
        </label>

        <label className="field-row">
          <span>Endpoint base URL</span>
          <input type="url" value={draft.baseUrl} placeholder={PROVIDER_DEFAULTS[draft.provider].baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} />
        </label>

        <label className="field-row">
          <span>Model</span>
          <input type="text" value={draft.model} placeholder={PROVIDER_DEFAULTS[draft.provider].model} onChange={(event) => update({ model: event.target.value })} />
        </label>

        <label className="field-row">
          <span>API key</span>
          <input type="password" value={draft.apiKey} autoComplete="off" placeholder="sk-..." onChange={(event) => update({ apiKey: event.target.value })} />
        </label>

        <label className="field-row">
          <span>Style guidance (optional)</span>
          <textarea
            className="style-guidance"
            rows={2}
            value={draft.stylePrompt}
            placeholder="e.g. Keep posts light-hearted and include a bit of humor."
            onChange={(event) => update({ stylePrompt: event.target.value })}
          />
        </label>

        <label className={`field-row toggle-row${autofitAvailable ? '' : ' is-disabled'}`}>
          <input
            type="checkbox"
            checked={draft.autoFit}
            disabled={!autofitAvailable}
            onChange={(event) => update({ autoFit: event.target.checked })}
          />
          <span>Auto-fit over-limit platforms after a 3s typing pause</span>
        </label>

        {test.status === 'ok' ? (
          <p className="test-result is-ok"><Check aria-hidden="true" size={15} /> {test.message}</p>
        ) : null}
        {test.status === 'error' ? (
          <p className="test-result is-error"><AlertTriangle aria-hidden="true" size={15} /> {test.message}</p>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="card-copy-button modal-test-button" disabled={!canTest || test.status === 'testing'} onClick={handleTest}>
            {test.status === 'testing' ? <Loader aria-hidden="true" size={15} className="spin" /> : null}
            {test.status === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
          <button type="button" className="card-copy-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-action">Save</button>
        </div>
      </form>
    </div>
  );
}
