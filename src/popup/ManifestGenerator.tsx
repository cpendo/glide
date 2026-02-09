// Manifest Generator Component - Developer tool for generating manifests

import { useState } from 'react';
import type { GlideManifest, ScannedPageData } from '../types';

interface ManifestGeneratorProps {
  onClose: () => void;
  onManifestGenerated: (manifest: GlideManifest) => void;
}

export function ManifestGenerator({ onClose, onManifestGenerated: _onManifestGenerated }: ManifestGeneratorProps) {
  const [step, setStep] = useState<'scan' | 'draft' | 'enhance' | 'done'>('scan');
  const [scanning, setScanning] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedPageData | null>(null);
  const [draftManifest, setDraftManifest] = useState<GlideManifest | null>(null);
  const [enhancedManifest, setEnhancedManifest] = useState<GlideManifest | null>(null);
  const [appName, setAppName] = useState('My App');
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab');

      // Use the page title as default app name
      if (tab.title && appName === 'My App') {
        setAppName(tab.title);
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });
      if (response.type === 'SCAN_RESULT') {
        setScannedData(response.data);
        setStep('draft');
      } else {
        throw new Error(response.error || 'Scan failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan page');
    } finally {
      setScanning(false);
    }
  }

  async function handleGenerateDraft() {
    if (!scannedData) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab');

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'GENERATE_MANIFEST',
        appName,
      });
      if (response.type === 'MANIFEST') {
        setDraftManifest(response.manifest);
        setStep('enhance');
      } else {
        throw new Error(response.error || 'Generation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate draft');
    }
  }

  async function handleEnhance() {
    if (!draftManifest) return;
    setEnhancing(true);
    setError(null);
    try {
      // Get page context from the actual tab, not the popup
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const pageContext = `Page: ${tab?.title || appName}\nURL: ${tab?.url || 'unknown'}`;
      const response = await chrome.runtime.sendMessage({
        type: 'ENHANCE_MANIFEST',
        manifest: draftManifest,
        pageContext,
      });
      if (response.type === 'MANIFEST') {
        setEnhancedManifest(response.manifest);
        setStep('done');
      } else {
        throw new Error(response.error || 'Enhancement failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enhance manifest');
    } finally {
      setEnhancing(false);
    }
  }

  function handleDownload() {
    const manifest = enhancedManifest || draftManifest;
    if (!manifest) return;

    const json = JSON.stringify(manifest, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'glide.manifest.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="manifest-generator">
      <div className="generator-header">
        <h2>Generate Manifest</h2>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      {error && (
        <div className="error-box">
          <p>{error}</p>
        </div>
      )}

      {step === 'scan' && (
        <div className="generator-step">
          <p className="step-desc">Scan the current page to detect forms and navigation.</p>
          <input
            type="text"
            className="api-input"
            placeholder="App name"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
          />
          <button className="primary-btn" onClick={handleScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Page'}
          </button>
        </div>
      )}

      {step === 'draft' && scannedData && (
        <div className="generator-step">
          <p className="step-desc">
            Found {scannedData.navigation.length} routes and {scannedData.forms.length} forms.
          </p>
          <button className="primary-btn" onClick={handleGenerateDraft}>
            Generate Draft Manifest
          </button>
        </div>
      )}

      {step === 'enhance' && draftManifest && (
        <div className="generator-step">
          <p className="step-desc">Enhance the manifest with AI to improve semantic hints and keywords.</p>
          <div className="manifest-preview">
            <pre>{JSON.stringify(draftManifest, null, 2)}</pre>
          </div>
          <button className="primary-btn" onClick={handleEnhance} disabled={enhancing}>
            {enhancing ? 'Enhancing...' : 'Enhance with AI'}
          </button>
        </div>
      )}

      {step === 'done' && (enhancedManifest || draftManifest) && (
        <div className="generator-step">
          <p className="step-desc">Manifest ready! Download and add it to your app's public folder.</p>
          <button className="primary-btn" onClick={handleDownload}>
            Download Manifest
          </button>
        </div>
      )}
    </div>
  );
}
