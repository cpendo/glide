// Manifest Generator - Converts scanned data to manifest format

import type { GlideManifest } from '../types/manifest';
import type { ScannedPageData } from '../types';
import { MANIFEST_SCHEMA_VERSIONS } from '../shared/constants';

/**
 * Generate a draft manifest from scanned page data
 */
export function generateManifestDraft(
  scanned: ScannedPageData,
  appName: string
): GlideManifest {
  // Build navigation
  const navigation: GlideManifest['navigation'] = {};
  for (const nav of scanned.navigation) {
    const routeName = pathToRouteName(nav.path);
    navigation[routeName] = {
      path: nav.path,
      description: nav.label,
      selector: nav.selector,
    };
  }

  // Build actions from forms
  const actions: GlideManifest['actions'] = {};
  for (let i = 0; i < scanned.forms.length; i++) {
    const form = scanned.forms[i];

    // Use route info from scanner, or try to match heuristically
    const route = form.route || findRouteForForm(form, navigation) || 'dashboard';

    // Generate meaningful action name from trigger button text or route
    const actionName = generateActionName(form, route, i);
    const keywords = generateKeywords(form, route);
    const description = generateDescription(form, route);

    actions[actionName] = {
      description,
      keywords,
      route,
      trigger: form.trigger,
      form: {},
      submit: form.submit,
    };

    // Convert fields
    for (const field of form.fields) {
      const fieldKey = normalizeFieldName(field.label);
      actions[actionName].form[fieldKey] = {
        selector: field.selector,
        type: field.type as any,
        required: field.required,
        semantic: field.semantic,
        options: field.options,
      };
    }
  }

  return {
    $schema: 'https://glide.dev/manifest.schema.json',
    schemaVersion: MANIFEST_SCHEMA_VERSIONS.CURRENT,
    app: {
      name: appName,
      version: '1.0.0',
      description: `${appName} - Glide manifest`,
    },
    navigation,
    actions,
  };
}

/**
 * Convert path to route name
 */
function pathToRouteName(path: string): string {
  // Remove leading/trailing slashes
  const clean = path.replace(/^\/+|\/+$/g, '');
  if (!clean) return 'dashboard';

  // Convert to camelCase
  return clean
    .split('/')
    .map(part => part.replace(/[^a-z0-9]+/gi, ''))
    .filter(Boolean)
    .map((part, i) => {
      if (i === 0) return part.toLowerCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

/**
 * Generate meaningful action name from form context
 */
function generateActionName(form: ScannedPageData['forms'][0], route: string, index: number): string {
  // Try to derive name from trigger button text
  if (form.triggerLabel) {
    const label = form.triggerLabel.toLowerCase().trim();
    // Convert "Add Stock" -> "add-stock", "New Sale" -> "new-sale", "Record Delivery" -> "record-delivery"
    const cleaned = label
      .replace(/[^a-z0-9\s]/gi, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
    if (cleaned && cleaned.length > 2) {
      return cleaned;
    }
  }

  // Derive from route and field context
  const fieldLabels = form.fields.map(f => f.label.toLowerCase()).join(' ');

  // Common patterns
  if (fieldLabels.includes('farmer')) return `add-farmer`;
  if (fieldLabels.includes('delivery') || fieldLabels.includes('weight')) return `record-delivery`;
  if (fieldLabels.includes('buyer') || fieldLabels.includes('company')) return `add-buyer`;
  if (fieldLabels.includes('sale') || fieldLabels.includes('batch')) return `record-sale`;
  if (fieldLabels.includes('process') || fieldLabels.includes('output')) return `process-batch`;
  if (fieldLabels.includes('expense') || fieldLabels.includes('category')) return `add-expense`;
  if (fieldLabels.includes('stock') || fieldLabels.includes('item')) return `add-stock`;

  // Fallback: use route name
  if (route !== 'dashboard') {
    return `${route}-action`;
  }

  return `action-${index + 1}`;
}

/**
 * Generate keywords for a form based on button text, fields, and route
 */
function generateKeywords(form: ScannedPageData['forms'][0], route: string): string[] {
  const keywords = new Set<string>();

  // Extract keywords from trigger button text
  if (form.triggerLabel) {
    const words = form.triggerLabel.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 2) {
        keywords.add(word);
        // Add related words
        if (word === 'add') { keywords.add('new'); keywords.add('create'); }
        if (word === 'new') { keywords.add('add'); keywords.add('create'); }
        if (word === 'record') { keywords.add('add'); keywords.add('log'); }
        if (word === 'process') { keywords.add('processing'); keywords.add('manufacture'); }
        if (word === 'stock') { keywords.add('inventory'); keywords.add('item'); }
        if (word === 'sale') { keywords.add('sell'); keywords.add('sold'); }
        if (word === 'expense') { keywords.add('cost'); keywords.add('spend'); }
      }
    }
  }

  // Add route-based keywords
  if (route && route !== 'dashboard') {
    keywords.add(route.toLowerCase());
  }

  // Extract keywords from field labels
  for (const field of form.fields) {
    const label = field.label.toLowerCase();
    if (label.includes('farmer')) { keywords.add('farmer'); keywords.add('member'); }
    if (label.includes('delivery') || label.includes('incoming')) { keywords.add('delivery'); keywords.add('incoming'); keywords.add('record'); }
    if (label.includes('sale') || label.includes('sell')) { keywords.add('sale'); keywords.add('sell'); keywords.add('sold'); }
    if (label.includes('process')) { keywords.add('process'); keywords.add('processing'); }
    if (label.includes('buyer') || label.includes('customer')) { keywords.add('buyer'); keywords.add('customer'); keywords.add('client'); }
    if (label.includes('expense')) { keywords.add('expense'); keywords.add('cost'); }
    if (label.includes('item') || label.includes('stock')) { keywords.add('stock'); keywords.add('item'); }
  }

  // Ensure at least some generic action keywords
  if (keywords.size === 0) {
    keywords.add('add');
    keywords.add('create');
    keywords.add('new');
  }

  // Add update/delete verbs to every action so Gemini can route them
  keywords.add('update');
  keywords.add('edit');
  keywords.add('delete');
  keywords.add('remove');

  return [...keywords].slice(0, 12);
}

/**
 * Generate a meaningful description for an action
 */
function generateDescription(form: ScannedPageData['forms'][0], route: string): string {
  // Use trigger button text as base
  if (form.triggerLabel) {
    const label = form.triggerLabel.trim();
    // Clean up: "Add Stock" -> "Add new stock item"
    if (label.length > 3) {
      return label;
    }
  }

  // Build from field context
  const fieldNames = form.fields.map(f => f.label).slice(0, 3).join(', ');
  if (route !== 'dashboard') {
    return `${route} form (${fieldNames})`;
  }

  return `Form with fields: ${fieldNames}`;
}

/**
 * Normalize field label to a clean field key name
 */
function normalizeFieldName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, '')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Find route for a form (heuristic fallback when scanner didn't tag a route)
 */
function findRouteForForm(
  form: ScannedPageData['forms'][0],
  navigation: GlideManifest['navigation']
): string | null {
  // Try to match form fields to route names
  const fieldText = form.fields.map(f => f.label.toLowerCase()).join(' ');

  for (const [routeName, route] of Object.entries(navigation)) {
    const routeLower = routeName.toLowerCase();
    const descLower = route.description.toLowerCase();

    // Check if field labels contain the route name
    if (fieldText.includes(routeLower) || fieldText.includes(descLower)) {
      return routeName;
    }

    // Check if route name matches field context
    if (routeLower.includes('stock') && fieldText.includes('item')) return routeName;
    if (routeLower.includes('sale') && fieldText.includes('price')) return routeName;
    if (routeLower.includes('expense') && fieldText.includes('category')) return routeName;
  }

  return null;
}
