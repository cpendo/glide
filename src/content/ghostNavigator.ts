// Ghost Navigator - Multi-step execution with navigation support + cancellation

import type {
  GlideManifest,
  ExecutionPlan,
  ExecutionStep,
  ExecutionState,
  ExecutionResult
} from '../types';
import { getManifest, getCurrentRoute } from './manifestLoader';
import { CancellationToken, CancellationError } from '../shared/cancellationToken';
import { GHOST_CLASS, TYPING_DELAY, ACTION_DELAY } from '../shared/constants';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

// Storage key for execution state (hand-off during navigation)
const EXECUTION_STATE_KEY = 'glide_execution_state';

// Active cancellation token (for cancel mid-flight)
let activeCancellationToken: CancellationToken | null = null;

// Lock to prevent concurrent executions
let isExecuting = false;

/**
 * Save execution state to storage (for navigation hand-off)
 */
async function saveExecutionState(state: ExecutionState): Promise<void> {
  await chrome.storage.local.set({ [EXECUTION_STATE_KEY]: state });
}

/**
 * Load execution state from storage
 */
async function loadExecutionState(): Promise<ExecutionState | null> {
  const result = await chrome.storage.local.get(EXECUTION_STATE_KEY);
  return result[EXECUTION_STATE_KEY] || null;
}

/**
 * Clear execution state
 */
async function clearExecutionState(): Promise<void> {
  await chrome.storage.local.remove(EXECUTION_STATE_KEY);
}

/**
 * Check if we have a pending execution to resume.
 * Clears the state from storage immediately to prevent duplicate resumes.
 */
export async function checkPendingExecution(): Promise<ExecutionState | null> {
  const state = await loadExecutionState();
  if (state && state.plan.status === 'executing') {
    // Clear immediately so a second caller doesn't also find it
    await clearExecutionState();
    console.log('[Glide] Found pending execution to resume');
    return state;
  }
  return null;
}

/**
 * Resume execution from saved state
 */
export async function resumeExecution(
  state: ExecutionState,
  onProgress?: (step: number, total: number, message: string) => void,
  cancellationToken?: CancellationToken
): Promise<ExecutionResult> {
  const manifest = getManifest();
  if (!manifest) {
    await clearExecutionState();
    return { success: false, completedSteps: 0, totalSteps: 0, message: 'No manifest loaded' };
  }

  return executeFromStep(state.plan, manifest, onProgress, cancellationToken);
}

/**
 * Execute a plan from the current step (with cancellation support)
 */
async function executeFromStep(
  plan: ExecutionPlan,
  manifest: GlideManifest,
  onProgress?: (step: number, total: number, message: string) => void,
  cancellationToken?: CancellationToken
): Promise<ExecutionResult> {
  // Prevent concurrent executions
  if (isExecuting) {
    console.log('[Glide] Execution already in progress, skipping');
    return { success: false, completedSteps: 0, totalSteps: plan.steps.length, message: 'Execution already in progress' };
  }
  isExecuting = true;

  const errors: string[] = [];
  let currentStep = plan.currentStep;

  // Store active token for cancellation
  if (cancellationToken) {
    activeCancellationToken = cancellationToken;
  }

  try {
    while (currentStep < plan.steps.length) {
      // Check for cancellation before each step
      if (cancellationToken) {
        cancellationToken.throwIfCancelled();
      }

      const step = plan.steps[currentStep];
      onProgress?.(currentStep + 1, plan.steps.length, getStepMessage(step));

      try {
        const result = await executeStep(step, manifest, plan, cancellationToken);

        if (result.needsNavigation) {
          // Save state and wait for page reload
          plan.currentStep = currentStep + 1;
          plan.status = 'executing';
          await saveExecutionState({ plan, startedAt: Date.now(), lastUpdated: Date.now() });

          // Navigation will cause page reload, execution resumes in new content script
          activeCancellationToken = null;
          isExecuting = false; // Release lock so resume can run
          return {
            success: true,
            completedSteps: currentStep + 1,
            totalSteps: plan.steps.length,
            message: 'Navigating... execution will continue on new page',
            navigating: true,
          };
        }

        if (!result.success) {
          errors.push(result.error || `Step ${currentStep + 1} failed`);
          if (result.fatal) break;
        }

        currentStep++;
      } catch (e) {
        if (e instanceof CancellationError) {
          // Cancellation requested
          await clearExecutionState();
          clearGhostHighlights();
          activeCancellationToken = null;
          return {
            success: false,
            completedSteps: currentStep,
            totalSteps: plan.steps.length,
            message: 'Execution cancelled',
            cancelled: true,
          };
        }
        errors.push(e instanceof Error ? e.message : 'Unknown error');
        break;
      }
    }

    // Execution complete
    await clearExecutionState();
    activeCancellationToken = null;
    isExecuting = false;

    const success = currentStep === plan.steps.length && errors.length === 0;
    return {
      success,
      completedSteps: currentStep,
      totalSteps: plan.steps.length,
      message: success ? 'Completed successfully' : `Completed with ${errors.length} error(s)`,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (e) {
    isExecuting = false;
    if (e instanceof CancellationError) {
      await clearExecutionState();
      clearGhostHighlights();
      activeCancellationToken = null;
      return {
        success: false,
        completedSteps: currentStep,
        totalSteps: plan.steps.length,
        message: 'Execution cancelled',
        cancelled: true,
      };
    }
    throw e;
  }
}

/**
 * Clear all ghost highlights
 */
function clearGhostHighlights(): void {
  document.querySelectorAll(`.${GHOST_CLASS}`).forEach(el => {
    el.classList.remove(GHOST_CLASS);
  });
}

/**
 * Execute a single step (with cancellation checks)
 */
async function executeStep(
  step: ExecutionStep,
  manifest: GlideManifest,
  plan: ExecutionPlan,
  cancellationToken?: CancellationToken
): Promise<{ success: boolean; needsNavigation?: boolean; error?: string; fatal?: boolean }> {
  // Check cancellation before step
  cancellationToken?.throwIfCancelled();

  switch (step.type) {
    case 'navigate':
      return executeNavigate(step, manifest, cancellationToken);

    case 'click':
      return executeClick(step, cancellationToken);

    case 'wait':
      await wait(parseInt(step.value || '500'));
      cancellationToken?.throwIfCancelled();
      return { success: true };

    case 'fill':
      return executeFill(step, plan.entities, cancellationToken);

    case 'select':
      return executeSelect(step, plan.entities, cancellationToken);

    case 'check':
      return executeCheck(step, cancellationToken);

    case 'submit':
      return executeSubmit(step, cancellationToken);

    case 'find-row':
      return executeFindRow(step, plan.entities, cancellationToken);

    case 'notify':
      console.log('[Glide]', step.message);
      return { success: true };

    default:
      return { success: false, error: `Unknown step type: ${step.type}` };
  }
}

/**
 * Navigate to a route
 */
async function executeNavigate(
  step: ExecutionStep,
  manifest: GlideManifest,
  cancellationToken?: CancellationToken
): Promise<{ success: boolean; needsNavigation?: boolean; error?: string }> {
  cancellationToken?.throwIfCancelled();

  const routeName = step.target;
  if (!routeName) return { success: false, error: 'No route specified' };

  const route = manifest.navigation[routeName];
  if (!route) return { success: false, error: `Unknown route: ${routeName}` };

  // Check if we're already on this route
  const currentRoute = getCurrentRoute(manifest);
  if (currentRoute === routeName) {
    console.log('[Glide] Already on route:', routeName);
    return { success: true };
  }

  // Find and click the navigation element
  const navElement = document.querySelector(route.selector) as HTMLElement;
  if (!navElement) {
    return { success: false, error: `Navigation element not found: ${route.selector}` };
  }

  navElement.classList.add(GHOST_CLASS);
  await wait(ACTION_DELAY);
  cancellationToken?.throwIfCancelled();

  // Click the nav element
  navElement.click();

  await wait(100);
  navElement.classList.remove(GHOST_CLASS);

  // Signal that navigation is happening
  return { success: true, needsNavigation: true };
}

/**
 * Click an element
 */
async function executeClick(
  step: ExecutionStep,
  cancellationToken?: CancellationToken
): Promise<{ success: boolean; error?: string }> {
  cancellationToken?.throwIfCancelled();

  const selector = step.target;
  if (!selector) return { success: false, error: 'No selector specified' };

  const element = await waitForElement(selector, 5000);
  if (!element) return { success: false, error: `Element not found: ${selector}` };

  cancellationToken?.throwIfCancelled();

  element.classList.add(GHOST_CLASS);
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(ACTION_DELAY);

  cancellationToken?.throwIfCancelled();
  element.click();

  await wait(ACTION_DELAY);
  element.classList.remove(GHOST_CLASS);

  // Wait for any specified element to appear
  if (step.waitFor) {
    const appeared = await waitForElement(step.waitFor, 5000);
    if (!appeared) {
      return { success: false, error: `Expected element did not appear: ${step.waitFor}` };
    }
  }

  return { success: true };
}

/**
 * Fill a text input
 */
async function executeFill(
  step: ExecutionStep,
  entities: Record<string, string>,
  cancellationToken?: CancellationToken
): Promise<{ success: boolean; error?: string; fatal?: boolean }> {
  cancellationToken?.throwIfCancelled();

  const selector = step.target;
  if (!selector) return { success: false, error: 'No selector specified' };

  // Get value from entities or step.value
  const fieldName = step.value || '';
  const value = entities[fieldName] || step.value || '';

  if (!value) {
    return { success: false, error: `No value provided for field "${fieldName}"`, fatal: true };
  }

  const element = await waitForElement(selector, 5000) as HTMLInputElement | HTMLTextAreaElement;
  if (!element) return { success: false, error: `Element not found: ${selector}`, fatal: true };

  cancellationToken?.throwIfCancelled();

  element.focus();
  element.classList.add(GHOST_CLASS);
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Use native setter to work with React/Vue
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  const setter = element instanceof HTMLTextAreaElement ? nativeTextAreaSetter : nativeInputValueSetter;

  const isNumberInput = element instanceof HTMLInputElement && element.type === 'number';

  if (isNumberInput) {
    // For number inputs, set the full value at once (character-by-character is unreliable)
    setInputValue(element, value, setter);
    element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await wait(TYPING_DELAY * 3);
  } else {
    // Clear field
    setInputValue(element, '', setter);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));

    // Type each character (with cancellation checks)
    for (let i = 0; i < value.length; i++) {
      cancellationToken?.throwIfCancelled();

      const char = value[i];
      const currentValue = element.value;
      setInputValue(element, currentValue + char, setter);

      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: char,
      }));

      await wait(TYPING_DELAY);
    }
  }

  cancellationToken?.throwIfCancelled();

  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.blur();

  // Verify the value was actually set (retry once if not)
  await wait(50);
  if (element.value !== value) {
    console.log(`[Glide] Fill retry: expected "${value}", got "${element.value}"`);
    setInputValue(element, value, setter);
    element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(50);
  }

  await wait(ACTION_DELAY);
  element.classList.remove(GHOST_CLASS);

  return { success: true };
}

/**
 * Set input value using native setter, with fallbacks
 */
function setInputValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  nativeSetter?: ((v: string) => void)
): void {
  // Method 1: Native prototype setter (works with React's value tracking)
  if (nativeSetter) {
    nativeSetter.call(element, value);
    return;
  }

  // Method 2: Direct property set
  element.value = value;
}

/**
 * Calculate similarity between two strings (0-1)
 */
function stringSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  if (aLower === bLower) return 1;
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.9;

  // Word-based matching
  const aWords = aLower.split(/\s+/);
  const bWords = bLower.split(/\s+/);

  let matchedWords = 0;
  for (const aWord of aWords) {
    if (bWords.some(bWord => bWord.includes(aWord) || aWord.includes(bWord))) {
      matchedWords++;
    }
  }

  return matchedWords / Math.max(aWords.length, bWords.length);
}

/**
 * Select an option from a dropdown with fuzzy matching
 */
async function executeSelect(
  step: ExecutionStep,
  entities: Record<string, string>,
  cancellationToken?: CancellationToken
): Promise<{ success: boolean; error?: string; fatal?: boolean }> {
  cancellationToken?.throwIfCancelled();

  const selector = step.target;
  if (!selector) return { success: false, error: 'No selector specified' };

  const fieldName = step.value || '';
  const value = entities[fieldName] || step.value || '';

  if (!value) {
    return { success: false, error: `No value provided for selection`, fatal: true };
  }

  const element = await waitForElement(selector, 5000) as HTMLSelectElement;
  if (!element) return { success: false, error: `Element not found: ${selector}`, fatal: true };

  cancellationToken?.throwIfCancelled();

  element.focus();
  element.classList.add(GHOST_CLASS);

  // Get all valid options (skip placeholder/empty options)
  const options = Array.from(element.options).filter(
    opt => opt.value && opt.value !== '' && !opt.disabled
  );

  if (options.length === 0) {
    element.classList.remove(GHOST_CLASS);
    return { success: false, error: 'No options available in dropdown', fatal: true };
  }

  // Find best matching option using fuzzy matching
  let bestMatch: HTMLOptionElement | null = null;
  let bestScore = 0;

  for (const opt of options) {
    // Check both value and text
    const valueScore = stringSimilarity(value, opt.value);
    const textScore = stringSimilarity(value, opt.text);
    const score = Math.max(valueScore, textScore);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = opt;
    }
  }

  // Require at least 0.6 similarity to accept a match
  if (bestMatch && bestScore >= 0.6) {
    console.log(`[Glide] Matched "${value}" to "${bestMatch.text}" (score: ${bestScore.toFixed(2)})`);
    element.value = bestMatch.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    element.classList.remove(GHOST_CLASS);
    const availableOptions = options.slice(0, 5).map(o => o.text).join(', ');
    return {
      success: false,
      error: `No match for "${value}". Available: ${availableOptions}${options.length > 5 ? '...' : ''}`,
      fatal: true,
    };
  }

  await wait(ACTION_DELAY);
  element.classList.remove(GHOST_CLASS);

  return { success: true };
}

/**
 * Check a checkbox
 */
async function executeCheck(
  step: ExecutionStep,
  cancellationToken?: CancellationToken
): Promise<{ success: boolean; error?: string }> {
  cancellationToken?.throwIfCancelled();

  const selector = step.target;
  if (!selector) return { success: false, error: 'No selector specified' };

  const element = await waitForElement(selector, 5000) as HTMLInputElement;
  if (!element) return { success: false, error: `Element not found: ${selector}` };

  cancellationToken?.throwIfCancelled();

  element.classList.add(GHOST_CLASS);

  if (!element.checked) {
    element.checked = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  await wait(ACTION_DELAY);
  element.classList.remove(GHOST_CLASS);

  return { success: true };
}

/**
 * Submit a form
 */
async function executeSubmit(
  step: ExecutionStep,
  cancellationToken?: CancellationToken
): Promise<{ success: boolean; error?: string; fatal?: boolean }> {
  cancellationToken?.throwIfCancelled();

  const selector = step.target;
  if (!selector) return { success: false, error: 'No submit selector specified' };

  const element = await waitForElement(selector, 5000) as HTMLElement;
  if (!element) return { success: false, error: `Submit button not found: ${selector}` };

  cancellationToken?.throwIfCancelled();

  element.classList.add(GHOST_CLASS);
  await wait(ACTION_DELAY);

  cancellationToken?.throwIfCancelled();
  element.click();

  await wait(ACTION_DELAY);
  element.classList.remove(GHOST_CLASS);

  // Wait for success or error
  if (step.waitFor || step.errorSelector) {
    const result = await waitForEither(step.waitFor, step.errorSelector, 10000);

    if (result.type === 'error') {
      return {
        success: false,
        error: `Form error: ${result.element?.textContent?.trim() || 'Unknown error'}`,
        fatal: true,
      };
    }

    if (result.type === 'timeout') {
      return { success: false, error: 'Submission timed out' };
    }
  }

  return { success: true };
}

/**
 * Find element by label text (case-insensitive partial match)
 */
function findByLabel(labelText: string, inputType?: string): HTMLElement | null {
  const labels = document.querySelectorAll('label');

  for (const label of labels) {
    if (label.textContent?.toLowerCase().includes(labelText.toLowerCase())) {
      // Check for 'for' attribute
      if (label.htmlFor) {
        const input = document.getElementById(label.htmlFor);
        if (input && (!inputType || (input as HTMLInputElement).type === inputType)) {
          return input;
        }
      }

      // Check for nested input
      const nestedInput = label.querySelector('input, select, textarea');
      if (nestedInput) return nestedInput as HTMLElement;

      // Check for adjacent input (label followed by input in same parent)
      const parent = label.parentElement;
      if (parent) {
        const input = parent.querySelector('input, select, textarea');
        if (input && (!inputType || (input as HTMLInputElement).type === inputType)) {
          return input as HTMLElement;
        }
      }
    }
  }

  return null;
}

/**
 * Enhanced element finder - supports label: prefix for label-based lookup
 */
export function findElement(selector: string): HTMLElement | null {
  // Label-based lookup: "label:Full Name" or "label:Full Name|text"
  if (selector.startsWith('label:')) {
    const labelPart = selector.slice(6);
    const [labelText, inputType] = labelPart.split('|');
    return findByLabel(labelText, inputType);
  }

  // Standard CSS selector
  return document.querySelector(selector) as HTMLElement;
}

/**
 * Wait for an element to appear
 */
export async function waitForElement(selector: string, timeout: number): Promise<HTMLElement | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = findElement(selector);
    if (element) return element;
    await wait(100);
  }

  return null;
}

/**
 * Wait for either a success or error element
 */
async function waitForEither(
  successSelector: string | undefined,
  errorSelector: string | undefined,
  timeout: number
): Promise<{ type: 'success' | 'error' | 'timeout'; element?: HTMLElement }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (successSelector) {
      const success = document.querySelector(successSelector) as HTMLElement;
      if (success) return { type: 'success', element: success };
    }

    if (errorSelector) {
      const error = document.querySelector(errorSelector) as HTMLElement;
      if (error) return { type: 'error', element: error };
    }

    await wait(100);
  }

  return { type: 'timeout' };
}

/**
 * Get human-readable message for a step
 */
function getStepMessage(step: ExecutionStep): string {
  switch (step.type) {
    case 'navigate':
      return `Navigating to ${step.target}...`;
    case 'click':
      return 'Opening form...';
    case 'fill':
      return `Filling ${step.value || 'field'}...`;
    case 'select':
      return `Selecting ${step.value || 'option'}...`;
    case 'submit':
      return 'Submitting...';
    case 'find-row':
      return `Finding record...`;
    default:
      return 'Processing...';
  }
}

/**
 * Find a matching row in tables or list-based layouts
 */
function findMatchingRow(searchText: string): HTMLElement | null {
  const searchLower = searchText.toLowerCase().trim();

  // Search <table> tbody rows
  const tables = document.querySelectorAll('table');
  for (const table of tables) {
    const rows = table.querySelectorAll('tbody tr');
    for (const row of rows) {
      const rowText = row.textContent?.toLowerCase() || '';
      if (rowText.includes(searchLower)) {
        return row as HTMLElement;
      }
    }
  }

  // Search list-based layouts (common in modern apps)
  // Look for repeated row-like elements
  const listSelectors = [
    '[role="row"]',
    '.list-group-item',
    '[class*="row"]:not(table *)',
    'li[class*="item"]',
  ];

  for (const sel of listSelectors) {
    const items = document.querySelectorAll(sel);
    for (const item of items) {
      const itemText = item.textContent?.toLowerCase() || '';
      if (itemText.includes(searchLower)) {
        return item as HTMLElement;
      }
    }
  }

  return null;
}

/**
 * Find an edit/delete/view action button within a row
 */
function findRowActionButton(row: HTMLElement, action: string): HTMLElement | null {
  const actionLower = action.toLowerCase();
  const isDelete = actionLower === 'delete' || actionLower === 'remove';
  const isEdit = actionLower === 'edit' || actionLower === 'update';

  const buttons = row.querySelectorAll('button, a, [role="button"]');

  for (const btn of buttons) {
    const el = btn as HTMLElement;
    const text = el.textContent?.toLowerCase().trim() || '';
    const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
    const title = el.getAttribute('title')?.toLowerCase() || '';
    const className = el.className?.toLowerCase() || '';

    // Check text content, aria-label, title
    const searchTerms = isDelete
      ? ['delete', 'remove', 'trash', 'destroy']
      : isEdit
        ? ['edit', 'update', 'modify', 'pencil']
        : [actionLower];

    for (const term of searchTerms) {
      if (text.includes(term) || ariaLabel.includes(term) || title.includes(term) || className.includes(term)) {
        return el;
      }
    }

    // Check for SVG icons (trash icon for delete, pencil icon for edit)
    const svg = el.querySelector('svg');
    if (svg) {
      const svgClass = svg.getAttribute('class')?.toLowerCase() || '';
      const paths = svg.querySelectorAll('path');
      const pathData = Array.from(paths).map(p => p.getAttribute('d') || '').join(' ');

      if (isDelete && (svgClass.includes('trash') || svgClass.includes('delete'))) return el;
      if (isEdit && (svgClass.includes('edit') || svgClass.includes('pencil'))) return el;

      // Common icon library patterns (feather icons, heroicons, etc.)
      // Trash icon typically has a shorter, more angular path
      if (isDelete && pathData.includes('M19 7l-.867 12.142')) return el;
      if (isEdit && pathData.includes('M11 4H4a2 2')) return el;
    }
  }

  // Positional fallback: last button for delete, second-to-last for edit
  if (buttons.length > 0) {
    if (isDelete) return buttons[buttons.length - 1] as HTMLElement;
    if (isEdit && buttons.length >= 2) return buttons[buttons.length - 2] as HTMLElement;
    if (isEdit) return buttons[0] as HTMLElement;
  }

  return null;
}

/**
 * Execute a find-row step: locate a record in a table and click its edit/delete button
 */
async function executeFindRow(
  step: ExecutionStep,
  entities: Record<string, string>,
  cancellationToken?: CancellationToken
): Promise<{ success: boolean; error?: string; fatal?: boolean }> {
  cancellationToken?.throwIfCancelled();

  const fieldName = step.value || '';
  const searchText = entities[fieldName] || step.value || '';
  const action = step.action || 'edit';

  if (!searchText) {
    return { success: false, error: 'No search text provided for find-row', fatal: true };
  }

  // Wait a bit for table content to load
  await wait(500);
  cancellationToken?.throwIfCancelled();

  // Try to find the matching row (retry a few times for dynamic content)
  let row: HTMLElement | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    row = findMatchingRow(searchText);
    if (row) break;
    await wait(1000);
    cancellationToken?.throwIfCancelled();
  }

  if (!row) {
    return { success: false, error: `Could not find record matching "${searchText}"`, fatal: true };
  }

  // Highlight the found row
  row.classList.add(GHOST_CLASS);
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(ACTION_DELAY);
  cancellationToken?.throwIfCancelled();

  // Find the action button
  const actionBtn = findRowActionButton(row, action);
  if (!actionBtn) {
    row.classList.remove(GHOST_CLASS);
    return { success: false, error: `Could not find ${action} button in the row`, fatal: true };
  }

  // For delete actions, auto-confirm browser dialogs
  const isDelete = action === 'delete' || action === 'remove';
  let originalConfirm: typeof window.confirm | null = null;

  if (isDelete) {
    originalConfirm = window.confirm;
    window.confirm = () => true;
  }

  try {
    actionBtn.classList.add(GHOST_CLASS);
    await wait(ACTION_DELAY);
    cancellationToken?.throwIfCancelled();

    actionBtn.click();

    await wait(ACTION_DELAY);
    actionBtn.classList.remove(GHOST_CLASS);
    row.classList.remove(GHOST_CLASS);
  } finally {
    // Restore original confirm
    if (isDelete && originalConfirm) {
      // Delay restore slightly to catch async confirm dialogs
      setTimeout(() => {
        window.confirm = originalConfirm!;
      }, 2000);
    }
  }

  // Wait for specified element if provided (e.g., edit form appearing)
  if (step.waitFor) {
    const appeared = await waitForElement(step.waitFor, 5000);
    if (!appeared) {
      return { success: false, error: `Expected element did not appear after ${action}: ${step.waitFor}` };
    }
  }

  return { success: true };
}

/**
 * Execute a full plan (with cancellation support)
 */
export async function executePlan(
  plan: ExecutionPlan,
  onProgress?: (step: number, total: number, message: string) => void,
  cancellationToken?: CancellationToken
): Promise<ExecutionResult> {
  const manifest = getManifest();
  if (!manifest) {
    return { success: false, completedSteps: 0, totalSteps: 0, message: 'No manifest loaded' };
  }

  plan.status = 'executing';
  plan.currentStep = 0;

  return executeFromStep(plan, manifest, onProgress, cancellationToken);
}

/**
 * Cancel active execution
 */
export function cancelActiveExecution(): void {
  if (activeCancellationToken) {
    activeCancellationToken.cancel();
  }
}
