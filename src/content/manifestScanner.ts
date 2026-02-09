// Manifest Scanner - Phase 1: Heuristic DOM scanning

import type { ScannedPageData } from '../types';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Scan the current page and all navigable routes to detect forms
 */
export async function scanPage(): Promise<ScannedPageData> {
  const navigation: ScannedPageData['navigation'] = [];
  const forms: ScannedPageData['forms'] = [];

  // Detect navigation
  const navLinks = detectNavigation();
  navigation.push(...navLinks);

  // Scan current page for forms first
  const currentRoute = pathToRouteName(window.location.pathname);
  const currentForms = await detectForms();
  for (const form of currentForms) {
    form.route = currentRoute;
  }
  forms.push(...currentForms);

  // Always visit other routes to find more forms (different pages have different forms)
  if (navLinks.length > 0) {
    const originalPath = window.location.pathname;

    for (const route of navLinks) {
      // Skip current page
      if (route.path === originalPath) continue;

      // Navigate to the route by clicking its nav link
      const navEl = document.querySelector(route.selector) as HTMLElement;
      if (!navEl) continue;

      navEl.click();
      await wait(800); // Wait for SPA navigation + render

      // Scan for forms on this page
      const routeName = pathToRouteName(route.path);
      const routeForms = await detectForms();
      for (const form of routeForms) {
        form.route = routeName;
      }
      forms.push(...routeForms);
    }

    // Navigate back to the original page
    const originalLink = navLinks.find(n => n.path === originalPath);
    if (originalLink) {
      const backEl = document.querySelector(originalLink.selector) as HTMLElement;
      if (backEl) {
        backEl.click();
        await wait(500);
      }
    } else {
      // Fallback: go to first route (usually dashboard)
      const firstLink = document.querySelector(navLinks[0].selector) as HTMLElement;
      if (firstLink) {
        firstLink.click();
        await wait(500);
      }
    }
  }

  return {
    navigation,
    forms,
  };
}

/**
 * Convert path to route name (used for route tagging)
 */
function pathToRouteName(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  if (!clean) return 'dashboard';
  return clean.split('/').filter(Boolean).map((part, i) => {
    if (i === 0) return part.toLowerCase();
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join('');
}

/**
 * Detect navigation elements
 */
function detectNavigation(): ScannedPageData['navigation'] {
  const nav: ScannedPageData['navigation'] = [];

  // Find navigation links (sidebar, header, tabs)
  const navSelectors = [
    'nav a',
    'aside a',
    '[role="navigation"] a',
    '.sidebar a',
    '.nav a',
    'header a',
  ];

  const seenPaths = new Set<string>();

  for (const selector of navSelectors) {
    const links = document.querySelectorAll<HTMLAnchorElement>(selector);
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

      // Parse path
      let path = href;
      try {
        const url = new URL(href, window.location.origin);
        path = url.pathname;
      } catch {
        // Relative path
        if (href.startsWith('/')) {
          path = href;
        } else {
          continue; // Skip relative paths for now
        }
      }

      if (seenPaths.has(path)) continue;
      seenPaths.add(path);

      const label = link.textContent?.trim() || link.getAttribute('aria-label') || path;
      nav.push({
        path,
        selector: generateSelector(link),
        label,
      });
    }
  }

  return nav;
}

/**
 * Detect forms on the page - including forms hidden behind buttons
 */
async function detectForms(): Promise<ScannedPageData['forms']> {
  const forms: ScannedPageData['forms'] = [];
  const scannedFormElements = new Set<HTMLFormElement>();

  // 1. Scan forms already visible in the DOM
  const visibleForms = document.querySelectorAll('form');
  for (const form of visibleForms) {
    scannedFormElements.add(form);
    const formData = scanForm(form);
    if (formData) {
      forms.push(formData);
    }
  }

  // 2. Scan modals/dialogs with forms
  const modals = document.querySelectorAll('[role="dialog"], .modal, .dialog, [class*="modal"]');
  for (const modal of modals) {
    const form = modal.querySelector('form');
    if (form && !scannedFormElements.has(form)) {
      scannedFormElements.add(form);
      const trigger = findModalTrigger(modal);
      const formData = scanForm(form);
      if (formData) {
        if (trigger) {
          formData.trigger = trigger;
        }
        forms.push(formData);
      }
    }
  }

  // 3. Look for action buttons that might reveal hidden forms
  // This handles React/Vue conditional rendering where forms only appear after clicking
  const triggerButtons = findFormTriggerButtons();
  for (const button of triggerButtons) {
    const formCountBefore = document.querySelectorAll('form').length;

    // IMPORTANT: Generate button selector BEFORE clicking, so form labels don't pollute it
    const buttonSelector = generateButtonSelector(button);
    const buttonText = button.textContent?.trim() || '';

    // Temporarily enable disabled buttons so we can click to discover the form
    const wasDisabled = (button as HTMLButtonElement).disabled;
    if (wasDisabled) {
      (button as HTMLButtonElement).disabled = false;
    }

    // Click the button to reveal the form
    button.click();
    await wait(500); // Wait for React/Vue to render

    // Check if new forms appeared
    const allForms = document.querySelectorAll('form');
    if (allForms.length > formCountBefore) {
      for (const form of allForms) {
        if (!scannedFormElements.has(form)) {
          scannedFormElements.add(form);
          const formData = scanForm(form);
          if (formData) {
            formData.trigger = {
              selector: buttonSelector,
              type: 'click',
            };
            formData.triggerLabel = buttonText;
            forms.push(formData);
          }
        }
      }
    } else {
      // No standard form appeared - check for data-ghost-id elements that appeared
      const ghostForm = scanDataAttributes();
      if (ghostForm && ghostForm.fields.length > 0) {
        ghostForm.trigger = {
          selector: buttonSelector,
          type: 'click',
        };
        ghostForm.triggerLabel = buttonText;
        forms.push(ghostForm);
      }
    }

    // Close the form - look for cancel button or click trigger again
    const allButtons = document.querySelectorAll<HTMLElement>('button');
    let closed = false;
    for (const btn of allButtons) {
      const text = btn.textContent?.toLowerCase().trim() || '';
      if (text === 'cancel' || text === 'close' || text === '\u00d7' || text === 'x') {
        btn.click();
        closed = true;
        break;
      }
    }
    if (!closed) {
      // Try clicking the trigger button again to toggle it off
      button.click();
    }

    // Restore disabled state
    if (wasDisabled) {
      (button as HTMLButtonElement).disabled = true;
    }

    await wait(300); // Wait for close animation
  }

  // 4. If still no forms found, scan all data-ghost-id elements as fallback
  if (forms.length === 0) {
    const ghostForm = scanDataAttributes();
    if (ghostForm) {
      forms.push(ghostForm);
    }
  }

  return forms;
}

/**
 * Find buttons that likely open/reveal forms
 */
function findFormTriggerButtons(): HTMLElement[] {
  const triggers: HTMLElement[] = [];
  const buttons = document.querySelectorAll<HTMLElement>('button, [role="button"]');
  const seenText = new Set<string>();

  for (const button of buttons) {
    const text = button.textContent?.toLowerCase().trim() || '';
    const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
    const combined = text + ' ' + ariaLabel;

    // Skip if already seen same text, or if it's a nav/submit/cancel button
    if (seenText.has(text)) continue;
    if (button.getAttribute('type') === 'submit') continue;
    if (button.closest('form')) continue; // Skip buttons inside forms
    if (button.closest('nav, aside')) continue; // Skip nav buttons

    // Match common "open form" button patterns
    const isFormTrigger =
      /\b(add|new|create|register|record|process|enter|log)\b/i.test(combined) &&
      !/\b(cancel|close|delete|remove)\b/i.test(combined);

    if (isFormTrigger) {
      seenText.add(text);
      triggers.push(button);
    }
  }

  return triggers;
}

/**
 * Generate a selector specifically for buttons (avoids findLabel which picks up form labels)
 */
function generateButtonSelector(button: HTMLElement): string {
  // Try data-ghost-id first
  const ghostId = button.getAttribute('data-ghost-id');
  if (ghostId) {
    return `[data-ghost-id="${ghostId}"]`;
  }

  // Try ID
  if (button.id) {
    return `#${button.id}`;
  }

  // Try unique class combinations (filter utility classes)
  const meaningfulClasses = Array.from(button.classList).filter(c =>
    !c.startsWith('glide-') &&
    /^(btn|button|action|primary|accent|cta)/i.test(c)
  );
  if (meaningfulClasses.length > 0) {
    return `button.${meaningfulClasses[0]}`;
  }

  // Fallback: use all non-utility classes
  const classes = Array.from(button.classList).filter(c => !c.startsWith('glide-'));
  if (classes.length > 0) {
    return `button.${classes[0]}`;
  }

  // Last resort: nth-child
  const parent = button.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(button);
    return `button:nth-child(${index + 1})`;
  }

  return 'button';
}

/**
 * Scan for elements with data-ghost-id attributes (for automation-ready apps)
 */
function scanDataAttributes(): ScannedPageData['forms'][0] | null {
  const ghostElements = document.querySelectorAll('[data-ghost-id]');
  if (ghostElements.length === 0) return null;

  const fields: ScannedPageData['forms'][0]['fields'] = [];
  let submit: { selector: string } | undefined;

  for (const el of ghostElements) {
    const ghostId = el.getAttribute('data-ghost-id') || '';
    if (ghostId.endsWith('-submit')) {
      submit = { selector: `[data-ghost-id="${ghostId}"]` };
      continue;
    }

    const input = el as HTMLElement;
    const label = findLabel(input) || ghostId.replace(/-/g, ' ');
    const type = inferFieldType(input);
    const required = isRequired(input);
    const options = input instanceof HTMLSelectElement ? extractOptions(input) : undefined;
    const semantic = generateSemanticHints(label, type);

    fields.push({
      selector: `[data-ghost-id="${ghostId}"]`,
      label,
      type,
      required,
      options,
      semantic,
    });
  }

  if (fields.length === 0) return null;
  return { fields, submit };
}

/**
 * Scan a single form
 */
function scanForm(form: HTMLFormElement): ScannedPageData['forms'][0] | null {
  const fields: ScannedPageData['forms'][0]['fields'] = [];

  // Prefer data-ghost-id elements within the form first
  const ghostInputs = form.querySelectorAll('[data-ghost-id]');
  if (ghostInputs.length > 0) {
    let submit: { selector: string } | undefined;
    for (const el of ghostInputs) {
      const ghostId = el.getAttribute('data-ghost-id') || '';
      if (ghostId.endsWith('-submit')) {
        submit = { selector: `[data-ghost-id="${ghostId}"]` };
        continue;
      }

      const input = el as HTMLElement;
      const label = findLabel(input) || ghostId.replace(/-/g, ' ');
      const type = inferFieldType(input);
      const required = isRequired(input);
      const options = input instanceof HTMLSelectElement ? extractOptions(input) : undefined;
      const semantic = generateSemanticHints(label, type);

      fields.push({
        selector: `[data-ghost-id="${ghostId}"]`,
        label,
        type,
        required,
        options,
        semantic,
      });
    }
    if (fields.length > 0) {
      return { fields, submit };
    }
  }

  // Fall back to standard input scanning
  const inputs = form.querySelectorAll('input, select, textarea');

  for (const input of inputs) {
    // Skip hidden inputs
    if (input instanceof HTMLInputElement && input.type === 'hidden') continue;
    // Skip submit buttons (handled separately)
    if (input instanceof HTMLInputElement && (input.type === 'submit' || input.type === 'button')) continue;

    const label = findLabel(input as HTMLElement);
    const selector = generateSelector(input as HTMLElement);
    const type = inferFieldType(input as HTMLElement);
    const required = isRequired(input as HTMLElement);
    const options = input instanceof HTMLSelectElement ? extractOptions(input) : undefined;
    const semantic = generateSemanticHints(label, type);

    fields.push({
      selector,
      label: label || input.getAttribute('placeholder') || input.getAttribute('name') || 'Field',
      type,
      required,
      options,
      semantic,
    });
  }

  if (fields.length === 0) return null;

  // Find submit button
  const submitButton = form.querySelector<HTMLElement>('button[type="submit"], input[type="submit"], button:not([type])');
  const submit = submitButton ? { selector: generateSelector(submitButton) } : undefined;

  return {
    fields,
    submit,
  };
}

/**
 * Find label for an input
 */
function findLabel(input: HTMLElement): string | null {
  // Check for 'for' attribute
  const id = input.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return label.textContent?.trim() || null;
  }

  // Check for nested label
  const parent = input.parentElement;
  if (parent) {
    // Only check labels that are direct children or within the same field container
    const label = parent.querySelector(':scope > label');
    if (label) return label.textContent?.trim() || null;

    // Check previous sibling
    let prev = input.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'LABEL') {
        return prev.textContent?.trim() || null;
      }
      prev = prev.previousElementSibling;
    }
  }

  // Check grandparent (common: div > label + div > input)
  const grandparent = input.parentElement?.parentElement;
  if (grandparent) {
    const label = grandparent.querySelector(':scope > label');
    if (label) return label.textContent?.trim() || null;
  }

  // Check aria-label
  const ariaLabel = input.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // Check placeholder as last resort
  const placeholder = input.getAttribute('placeholder');
  if (placeholder) return placeholder;

  return null;
}

/**
 * Generate a CSS selector for an element
 */
function generateSelector(element: HTMLElement): string {
  // Try data-ghost-id first (automation-ready apps)
  const ghostId = element.getAttribute('data-ghost-id');
  if (ghostId) {
    return `[data-ghost-id="${ghostId}"]`;
  }

  // Try ID
  if (element.id) {
    return `#${element.id}`;
  }

  // For anchor elements, use href attribute (most reliable for nav links)
  if (element instanceof HTMLAnchorElement && element.getAttribute('href')) {
    return `a[href='${element.getAttribute('href')}']`;
  }

  // Try name attribute
  if (element.getAttribute('name')) {
    const name = element.getAttribute('name')!;
    return `[name="${name}"]`;
  }

  // For submit buttons, prefer type attribute selector (avoids collision with trigger buttons)
  if (element.tagName === 'BUTTON' && element.getAttribute('type') === 'submit') {
    return 'button[type="submit"]';
  }

  // Try label-based selector (for form inputs only, not buttons)
  if (element.tagName !== 'BUTTON') {
    const label = findLabel(element);
    if (label) {
      return `label:${label}`;
    }
  }

  // Fallback to tag + class
  const classes = Array.from(element.classList).filter(c => !c.startsWith('glide-'));
  if (classes.length > 0) {
    return `${element.tagName.toLowerCase()}.${classes[0]}`;
  }

  // Last resort: tag + nth-child
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(element);
    return `${element.tagName.toLowerCase()}:nth-child(${index + 1})`;
  }

  return element.tagName.toLowerCase();
}

/**
 * Infer field type
 */
function inferFieldType(input: HTMLElement): string {
  if (input instanceof HTMLInputElement) {
    return input.type || 'text';
  }
  if (input instanceof HTMLSelectElement) {
    return 'select';
  }
  if (input instanceof HTMLTextAreaElement) {
    return 'textarea';
  }
  return 'text';
}

/**
 * Check if field is required
 */
function isRequired(input: HTMLElement): boolean {
  if (input.hasAttribute('required')) return true;
  if (input.getAttribute('aria-required') === 'true') return true;

  // Check for * indicator in label
  const label = findLabel(input);
  if (label && label.includes('*')) return true;

  return false;
}

/**
 * Extract options from select - prefer display text over value
 */
function extractOptions(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .filter(opt => opt.value && !opt.disabled)
    .map(opt => opt.textContent?.trim() || opt.value);
}

/**
 * Generate semantic hints from label and type
 */
function generateSemanticHints(label: string | null, _type: string): string[] {
  const hints: string[] = [];

  if (!label) return hints;

  const lowerLabel = label.toLowerCase();

  // Common patterns
  if (lowerLabel.includes('name')) hints.push('name', 'called', 'named');
  if (lowerLabel.includes('phone') || lowerLabel.includes('tel')) hints.push('phone', 'mobile', 'contact', 'number');
  if (lowerLabel.includes('email') || lowerLabel.includes('mail')) hints.push('email', 'mail');
  if (lowerLabel.includes('address')) hints.push('address', 'location');
  if (lowerLabel.includes('quantity') || lowerLabel.includes('amount') || lowerLabel.includes('qty')) {
    hints.push('quantity', 'amount', 'how much', 'how many');
  }
  if (lowerLabel.includes('weight') || lowerLabel.includes('kg')) hints.push('weight', 'kg', 'kilos');
  if (lowerLabel.includes('price') || lowerLabel.includes('cost')) hints.push('price', 'cost', 'rate');
  if (lowerLabel.includes('date')) hints.push('date', 'when');
  if (lowerLabel.includes('status')) hints.push('status');
  if (lowerLabel.includes('grade')) hints.push('grade', 'quality');
  if (lowerLabel.includes('notes') || lowerLabel.includes('comment') || lowerLabel.includes('description')) {
    hints.push('notes', 'comment', 'description');
  }
  if (lowerLabel.includes('category')) hints.push('category', 'type');
  if (lowerLabel.includes('supplier') || lowerLabel.includes('vendor')) hints.push('supplier', 'vendor', 'from');
  if (lowerLabel.includes('customer') || lowerLabel.includes('buyer')) hints.push('customer', 'buyer', 'client');
  if (lowerLabel.includes('item') || lowerLabel.includes('product')) hints.push('item', 'product', 'stock');
  if (lowerLabel.includes('unit')) hints.push('unit', 'measure');
  if (lowerLabel.includes('payment')) hints.push('payment', 'pay', 'method');
  if (lowerLabel.includes('expense')) hints.push('expense', 'cost', 'spend');
  if (lowerLabel.includes('sale') || lowerLabel.includes('sell')) hints.push('sale', 'sell', 'sold');

  // Add label words as hints
  const words = lowerLabel.split(/\s+/).filter(w => w.length > 2);
  hints.push(...words.slice(0, 3));

  return [...new Set(hints)]; // Remove duplicates
}

/**
 * Find modal trigger button
 */
function findModalTrigger(modal: Element): { selector: string; type: 'click' } | undefined {
  // Look for buttons that might open this modal
  const modalId = modal.id;
  if (modalId) {
    const trigger = document.querySelector(`[data-target="#${modalId}"], [aria-controls="${modalId}"]`);
    if (trigger) {
      return {
        selector: generateSelector(trigger as HTMLElement),
        type: 'click',
      };
    }
  }

  // Look for buttons with action text near the modal
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    const text = button.textContent?.toLowerCase() || '';
    if (/\b(add|new|create|record|process)\b/i.test(text) &&
        !button.closest('form') &&
        button.closest('body') === modal.closest('body')) {
      return {
        selector: generateButtonSelector(button),
        type: 'click',
      };
    }
  }

  return undefined;
}
