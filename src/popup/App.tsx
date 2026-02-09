import { useEffect, useState, useRef } from 'react';
import { useGlideStore } from './store';
import { t, setLanguage, getLanguage, initI18n } from '../shared/i18n';
import { ManifestGenerator } from './ManifestGenerator';
import type { GlideManifest } from '../types/manifest';

export function App() {
  const {
    state,
    status,
    manifest,
    plan,
    command,
    error,
    hasApiKey,
    commandHistory,
    currentStep,
    totalSteps,
    stepMessage,
    language,
    setState,
    setStatus,
    setManifest,
    setPlan,
    setCommand,
    setError,
    setHasApiKey,
    setLanguage: setStoreLanguage,
    addToHistory,
    reset,
  } = useGlideStore();

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showManifestGenerator, setShowManifestGenerator] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize i18n and load language
  useEffect(() => {
    initI18n().then(() => {
      const savedLang = getLanguage();
      setStoreLanguage(savedLang);
    });
  }, []);

  // Check API key and load status on mount
  useEffect(() => {
    checkApiKey();
  }, []);

  // Load manifest when API key is ready
  useEffect(() => {
    if (hasApiKey) {
      loadStatus();
    }
  }, [hasApiKey]);

  // Focus input when ready
  useEffect(() => {
    if (state === 'ready' && manifest && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state, manifest]);

  async function checkApiKey() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_API_KEY' });
      const hasKey = response.type === 'SUCCESS';
      setHasApiKey(hasKey);
      if (!hasKey) {
        setShowSettings(true);
      }
    } catch (err) {
      console.error('Failed to check API key:', err);
    }
  }

  async function loadStatus() {
    setState('loading-manifest');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab');

      // Inject content script if needed
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
      } catch {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/index.js'],
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content/content.css'],
        });
        await new Promise(r => setTimeout(r, 200));
      }

      // Get status
      const statusResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });
      if (statusResponse.type === 'STATUS') {
        setStatus(statusResponse.status);
      }

      // Get manifest
      const manifestResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_MANIFEST' });
      if (manifestResponse.type === 'MANIFEST' && manifestResponse.manifest) {
        setManifest(manifestResponse.manifest);
        setState('ready');
      } else {
        setState('no-manifest');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim() || !manifest) return;

    setState('processing');
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PARSE_COMMAND',
        command: command.trim(),
        manifest,
        currentRoute: status?.currentRoute || null,
      });

      if (response.type === 'PLAN') {
        setPlan(response.plan);
        setState('confirming');
        addToHistory(command.trim());
      } else {
        throw new Error(response.error || 'Failed to parse command');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process');
    }
  }

  async function handleConfirm() {
    if (!plan) return;

    setState('executing');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab');

      plan.status = 'confirmed';
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'EXECUTE_PLAN',
        plan,
      });

      if (response.type === 'EXECUTION_RESULT') {
        if (response.result.navigating) {
          // Execution is paused for navigation, will resume on new page
          setState('done');
          // Close popup - execution continues in background via content script
          setTimeout(() => {
            reset();
            setCommand('');
            window.close();
          }, 1000);
        } else if (response.result.success) {
          setState('done');
          setTimeout(() => {
            reset();
            setCommand('');
            setState('ready');
          }, 1500);
        } else if (response.result.cancelled) {
          reset();
          setCommand('');
          setState('ready');
        } else {
          // Show detailed error messages from execution
          const errorDetails = response.result.errors?.length
            ? response.result.errors.join('\n')
            : response.result.message;
          setError(errorDetails);
          setState('ready');
        }
      } else {
        throw new Error(response.error || 'Execution failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    }
  }

  async function handleCancel() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab');

      await chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_EXECUTION' });
      setState('ready');
      reset();
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
  }

  async function saveApiKey() {
    if (!apiKeyInput.trim()) return;

    await chrome.runtime.sendMessage({
      type: 'SET_API_KEY',
      apiKey: apiKeyInput.trim(),
    });

    setHasApiKey(true);
    setShowSettings(false);
    setApiKeyInput('');
    loadStatus();
  }

  async function handleLanguageChange(lang: 'en' | 'sw') {
    await setLanguage(lang);
    setStoreLanguage(lang);
  }

  // Settings panel
  if (showSettings) {
    return (
      <div className="popup">
        <header className="header">
          <h1 className="logo">Glide</h1>
          {hasApiKey && (
            <button className="settings-btn" onClick={() => setShowSettings(false)}>
              {t('ui.cancel')}
            </button>
          )}
        </header>

        <div className="settings-panel">
          <h2 className="settings-title">{t('ui.apiKeyRequired')}</h2>
          <p className="settings-desc">
            Enter your Gemini API key.{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">
              Get one here
            </a>
          </p>
          <input
            type="password"
            className="api-input"
            placeholder="Enter API key..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
          />
          <button className="primary-btn" onClick={saveApiKey} disabled={!apiKeyInput.trim()}>
            Save Key
          </button>

          {hasApiKey && (
            <div className="settings-section">
              <h3 className="settings-title">{t('ui.language')}</h3>
              <div className="language-switcher">
                <button
                  className={`lang-btn ${language === 'en' ? 'active' : ''}`}
                  onClick={() => handleLanguageChange('en')}
                >
                  {t('ui.english')}
                </button>
                <button
                  className={`lang-btn ${language === 'sw' ? 'active' : ''}`}
                  onClick={() => handleLanguageChange('sw')}
                >
                  {t('ui.swahili')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Manifest Generator
  if (showManifestGenerator) {
    return (
      <div className="popup">
        <ManifestGenerator
          onClose={() => setShowManifestGenerator(false)}
          onManifestGenerated={(manifest) => {
            setManifest(manifest);
            setShowManifestGenerator(false);
            setState('ready');
          }}
        />
      </div>
    );
  }

  // No manifest state
  if (state === 'no-manifest') {
    return (
      <div className="popup">
        <header className="header">
          <h1 className="logo">Glide</h1>
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            <SettingsIcon />
          </button>
        </header>

        <div className="no-manifest">
          <div className="no-manifest-icon">📋</div>
          <h2>{t('ui.noManifest')}</h2>
          <p>This app hasn't been configured for Glide yet.</p>
          <p className="hint">
            Developers: Add a <code>glide.manifest.json</code> to enable natural language automation.
          </p>
          <button className="primary-btn" onClick={() => setShowManifestGenerator(true)} style={{ marginTop: '12px' }}>
            Generate Manifest
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="popup">
      <header className="header">
        <h1 className="logo">Glide</h1>
        <button className="settings-btn" onClick={() => setShowSettings(true)}>
          <SettingsIcon />
        </button>
      </header>

      {/* App info */}
      {manifest && (
        <div className="app-info">
          <span className="app-name">{manifest.app.name}</span>
          {status?.currentRoute && (
            <span className="current-route">/ {status.currentRoute}</span>
          )}
        </div>
      )}

      {/* Status indicator */}
      <div className="status">
        <span className={`status-dot ${state}`} />
        <span className="status-text">
          {state === 'loading-manifest' && t('ui.processing')}
          {state === 'ready' && t('ui.ready')}
          {state === 'processing' && t('ui.processing')}
          {state === 'confirming' && t('ui.confirming')}
          {state === 'executing' && (stepMessage || t('ui.executing'))}
          {state === 'done' && t('ui.done')}
          {state === 'error' && t('ui.error')}
        </span>
      </div>

      {/* Error message */}
      {error && (
        <div className="error-box">
          <div className="error-messages">
            {error.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <button onClick={() => { setError(null); setState('ready'); }}>{t('ui.cancel')}</button>
        </div>
      )}

      {/* Confirmation panel */}
      {state === 'confirming' && plan && (
        <div className="confirm-panel">
          <p className="confirm-message">{plan.confirmMessage}</p>

          {/* Validation failure - no steps means missing required data */}
          {plan.steps.length === 0 ? (
            <div className="confirm-buttons">
              <button className="primary-btn" onClick={() => {
                reset();
                setState('ready');
              }}>
                OK
              </button>
            </div>
          ) : (
            <>
              {/* Show extracted entities */}
              {Object.keys(plan.entities).length > 0 && (
                <div className="entities">
                  {Object.entries(plan.entities).map(([key, value]) => (
                    <div key={key} className="entity">
                      <span className="entity-key">{key}</span>
                      <span className="entity-value">{value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Show steps preview */}
              <div className="steps-preview">
                {plan.steps.slice(0, 4).map((step, i) => (
                  <div key={i} className="step-item">
                    <StepIcon type={step.type} />
                    <span>{getStepLabel(step)}</span>
                  </div>
                ))}
                {plan.steps.length > 4 && (
                  <div className="step-item more">+{plan.steps.length - 4} more steps</div>
                )}
              </div>

              <div className="confirm-buttons">
                <button className="secondary-btn" onClick={() => {
                  reset();
                  setState('ready');
                }}>
                  {t('ui.cancel')}
                </button>
                <button className="primary-btn" onClick={handleConfirm}>
                  {t('ui.execute')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Execution progress */}
      {state === 'executing' && (
        <div className="execution-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(currentStep / Math.max(totalSteps, 1)) * 100}%` }}
            />
          </div>
          <p className="progress-text">
            Step {currentStep} of {totalSteps}
          </p>
          <button className="secondary-btn" onClick={handleCancel} style={{ marginTop: '8px', width: '100%' }}>
            {t('ui.stop')}
          </button>
        </div>
      )}

      {/* Command input */}
      {(state === 'ready' || state === 'processing') && (
        <form onSubmit={handleSubmit} className="command-form">
          <input
            ref={inputRef}
            type="text"
            className="command-input"
            placeholder={getPlaceholder(manifest)}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={state === 'processing'}
          />
          <button
            type="submit"
            className="submit-btn"
            disabled={!command.trim() || state === 'processing'}
          >
            {state === 'processing' ? <LoadingIcon /> : <SendIcon />}
          </button>
        </form>
      )}

      {/* Command history */}
      {state === 'ready' && commandHistory.length > 0 && !command && (
        <div className="history">
          <p className="history-label">Recent</p>
          {commandHistory.slice(0, 3).map((cmd, i) => (
            <button key={i} className="history-item" onClick={() => setCommand(cmd)}>
              {cmd}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Generate a dynamic placeholder based on the loaded manifest
function getPlaceholder(manifest: GlideManifest | null): string {
  if (!manifest) return 'Type a command...';

  const actions = Object.values(manifest.actions);
  if (actions.length === 0) return 'Type a command...';

  // Pick the first action and build a natural example
  const action = actions[0];
  const desc = action.description?.toLowerCase() || '';
  const keywords = action.keywords || [];

  // Use the first keyword as the verb
  const verb = keywords[0] || 'add';

  // Get field names for context
  const fieldNames = Object.keys(action.form).slice(0, 2);

  if (desc && desc.length > 5 && desc.length < 50) {
    return `e.g. "${desc.toLowerCase()}"`;
  }

  if (fieldNames.length > 0) {
    return `e.g. "${verb} ${fieldNames.join(', ')}..."`;
  }

  return `e.g. "${verb}..."`;
}

// Helper function
function getStepLabel(step: { type: string; target?: string; value?: string }): string {
  switch (step.type) {
    case 'navigate':
      return `Go to ${step.target}`;
    case 'click':
      return 'Open form';
    case 'fill':
      return `Fill ${step.value || 'field'}`;
    case 'select':
      return `Select ${step.value || 'option'}`;
    case 'submit':
      return 'Submit';
    case 'find-row':
      return 'Find record';
    default:
      return step.type;
  }
}

// Icons
function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinning">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function StepIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    navigate: '>',
    click: '+',
    fill: '-',
    select: '*',
    submit: '!',
    'find-row': '?',
  };
  return <span className="step-icon">{icons[type] || '•'}</span>;
}
