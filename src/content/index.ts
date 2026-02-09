// Content Script Entry Point - Handles manifest loading, execution, cancellation, and scanning

import { loadManifest, getManifest, getCurrentRoute } from './manifestLoader';
import { executePlan, checkPendingExecution, resumeExecution, cancelActiveExecution } from './ghostNavigator';
import { scanPage } from './manifestScanner';
import { generateManifestDraft } from './manifestGenerator';
import { createCancellationToken } from '../shared/cancellationToken';
import type { ExecutionPlan, GlideStatus } from '../types';

// Active cancellation token
let activeCancellationToken: ReturnType<typeof createCancellationToken> | null = null;

// Guard against duplicate resume attempts
let resumeInProgress = false;

// Initialize on load
async function initialize() {
  console.log('[Glide] Content script initializing on:', window.location.pathname);

  // Always load manifest first - needed for execution
  const manifest = await loadManifest();
  if (manifest) {
    console.log('[Glide] Manifest loaded:', manifest.app.name);
  } else {
    console.log('[Glide] No manifest found - Glide features disabled');
  }

  // Check for pending execution (navigation hand-off)
  if (resumeInProgress) return;
  const pendingState = await checkPendingExecution();
  console.log('[Glide] Pending execution state:', pendingState ? `Plan at step ${pendingState.plan.currentStep}` : 'none');

  if (pendingState) {
    if (!manifest) {
      console.error('[Glide] Cannot resume execution - no manifest');
      return;
    }

    resumeInProgress = true;
    console.log('[Glide] Resuming pending execution from step', pendingState.plan.currentStep);

    // Small delay to let page settle
    await new Promise(r => setTimeout(r, 800));

    try {
      const token = createCancellationToken();
      activeCancellationToken = token;
      const result = await resumeExecution(pendingState, (step, total, message) => {
        console.log(`[Glide] Step ${step}/${total}: ${message}`);
      }, token);
      console.log('[Glide] Execution result:', result);
      activeCancellationToken = null;
    } finally {
      resumeInProgress = false;
    }
  }
}

// Message handlers
chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch(err => {
        console.error('[Glide] Error:', err);
        sendResponse({ type: 'ERROR', error: err.message });
      });
    return true;
  }
);

async function handleMessage(message: { type: string; [key: string]: unknown }): Promise<unknown> {
  switch (message.type) {
    case 'PING':
      return { type: 'PONG' };

    case 'GET_STATUS':
      return getStatus();

    case 'GET_MANIFEST':
      return { type: 'MANIFEST', manifest: getManifest() };

    case 'EXECUTE_PLAN': {
      const plan = message.plan as ExecutionPlan;
      if (!plan) {
        return { type: 'ERROR', error: 'No plan provided' };
      }

      // Create cancellation token
      const token = createCancellationToken();
      activeCancellationToken = token;

      const result = await executePlan(plan, (step, total, msg) => {
        // Could send progress updates to popup here
        console.log(`[Glide] ${step}/${total}: ${msg}`);
      }, token);

      // Clear token if execution completed
      if (!result.navigating) {
        activeCancellationToken = null;
      }

      return { type: 'EXECUTION_RESULT', result };
    }

    case 'CANCEL_EXECUTION': {
      if (activeCancellationToken) {
        cancelActiveExecution();
        activeCancellationToken = null;
        return { type: 'SUCCESS', message: 'Execution cancelled' };
      }
      return { type: 'ERROR', error: 'No active execution to cancel' };
    }

    case 'SCAN_PAGE': {
      try {
        const scanned = await scanPage();
        return { type: 'SCAN_RESULT', data: scanned };
      } catch (e) {
        return { type: 'ERROR', error: e instanceof Error ? e.message : 'Scan failed' };
      }
    }

    case 'GENERATE_MANIFEST': {
      const appName = (message.appName as string) || document.title || 'My App';
      try {
        const scanned = await scanPage();
        const draft = generateManifestDraft(scanned, appName);
        return { type: 'MANIFEST', manifest: draft };
      } catch (e) {
        return { type: 'ERROR', error: e instanceof Error ? e.message : 'Generation failed' };
      }
    }

    default:
      return { type: 'ERROR', error: `Unknown message type: ${message.type}` };
  }
}

/**
 * Get current Glide status
 */
function getStatus(): { type: 'STATUS'; status: GlideStatus } {
  const manifest = getManifest();
  const currentRoute = manifest ? getCurrentRoute(manifest) : null;

  return {
    type: 'STATUS',
    status: {
      state: manifest ? 'ready' : 'no-manifest',
      manifestLoaded: !!manifest,
      appName: manifest?.app.name,
      currentRoute: currentRoute || undefined,
    },
  };
}

// Initialize
initialize();

// Handle SPA navigation (React, Vue, etc.) - URL changes without page reload
let lastUrl = window.location.href;

const checkUrlChange = async () => {
  if (window.location.href !== lastUrl) {
    console.log('[Glide] SPA navigation detected:', lastUrl, '->', window.location.href);
    lastUrl = window.location.href;

    // Skip if another resume is already running
    if (resumeInProgress) {
      console.log('[Glide] Resume already in progress, skipping');
      return;
    }

    // Wait for page content to render AND for any in-flight execution to finish saving state
    await new Promise(r => setTimeout(r, 1000));

    // Check for pending execution
    if (resumeInProgress) return; // Re-check after the wait
    const pendingState = await checkPendingExecution();
    if (pendingState) {
      const manifest = getManifest();
      if (!manifest) {
        console.error('[Glide] Cannot resume - no manifest');
        return;
      }

      resumeInProgress = true;
      console.log('[Glide] Resuming after SPA navigation, step', pendingState.plan.currentStep);
      try {
        const token = createCancellationToken();
        activeCancellationToken = token;
        const result = await resumeExecution(pendingState, (step, total, message) => {
          console.log(`[Glide] Step ${step}/${total}: ${message}`);
        }, token);
        console.log('[Glide] Execution result:', result);
        activeCancellationToken = null;
      } finally {
        resumeInProgress = false;
      }
    }
  }
};

// Poll for URL changes (handles pushState which doesn't fire popstate)
setInterval(checkUrlChange, 300);

// Also listen for popstate (back/forward buttons)
window.addEventListener('popstate', () => {
  setTimeout(checkUrlChange, 100);
});
