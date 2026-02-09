// Manifest Loader - Loads Glide manifest from the app

import type { GlideManifest } from '../types/manifest';
import { validateManifestVersion } from '../types/manifest';
import { MANIFEST_SCHEMA_VERSIONS } from '../shared/constants';

declare global {
  interface Window {
    __GLIDE__?: GlideManifest;
  }
}

// Cache the loaded manifest
let cachedManifest: GlideManifest | null = null;

/**
 * Load manifest from the app
 * Priority:
 * 1. window.__GLIDE__ (app injects it)
 * 2. <script type="application/glide+json"> tag
 * 3. /glide.manifest.json file
 */
export async function loadManifest(): Promise<GlideManifest | null> {
  if (cachedManifest) return cachedManifest;

  let manifest: GlideManifest | null = null;
  let source = '';

  // 1. Check window.__GLIDE__
  if (window.__GLIDE__) {
    manifest = window.__GLIDE__;
    source = 'window.__GLIDE__';
  }
  // 2. Check for <script type="application/glide+json">
  else {
    const scriptTag = document.querySelector('script[type="application/glide+json"]');
    if (scriptTag?.textContent) {
      try {
        manifest = JSON.parse(scriptTag.textContent);
        source = 'script tag';
      } catch (e) {
        console.error('[Glide] Failed to parse manifest from script tag:', e);
      }
    }
  }

  // 3. Try fetching /glide.manifest.json
  if (!manifest) {
    try {
      const res = await fetch('/glide.manifest.json');
      if (res.ok) {
        manifest = await res.json();
        source = '/glide.manifest.json';
      }
    } catch (e) {
      // File doesn't exist, that's okay
    }
  }

  if (!manifest) {
    console.log('[Glide] No manifest found for this app');
    return null;
  }

  // Validate schema version
  const schemaVersion = manifest.schemaVersion || '1.0.0';
  const isValid = validateManifestVersion(manifest);

  if (!isValid) {
    console.warn(
      `[Glide] Manifest schema version ${schemaVersion} is not supported. ` +
      `Supported versions: ${MANIFEST_SCHEMA_VERSIONS.SUPPORTED.join(', ')}. ` +
      `Execution may fail.`
    );
  } else if (schemaVersion !== MANIFEST_SCHEMA_VERSIONS.CURRENT) {
    console.log(
      `[Glide] Manifest schema version ${schemaVersion} loaded (current: ${MANIFEST_SCHEMA_VERSIONS.CURRENT}). ` +
      `Compatibility mode enabled.`
    );
  }

  console.log(`[Glide] Manifest loaded from ${source} (schema: ${schemaVersion})`);
  cachedManifest = manifest;
  return cachedManifest;
}

/**
 * Get the current manifest (if loaded)
 */
export function getManifest(): GlideManifest | null {
  return cachedManifest;
}

/**
 * Clear cached manifest (useful for development/testing)
 */
export function clearManifestCache(): void {
  cachedManifest = null;
}

/**
 * Find which route we're currently on
 */
export function getCurrentRoute(manifest: GlideManifest): string | null {
  const currentPath = window.location.pathname;

  for (const [routeName, route] of Object.entries(manifest.navigation)) {
    if (route.path === currentPath) {
      return routeName;
    }
    // Handle dynamic routes with simple pattern matching
    if (route.path.includes(':') || route.path.includes('*')) {
      const pattern = route.path
        .replace(/:[^/]+/g, '[^/]+')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(currentPath)) {
        return routeName;
      }
    }
  }

  return null;
}

/**
 * Find which action best matches user intent
 */
export function findActionByKeywords(
  manifest: GlideManifest,
  text: string
): string | null {
  const lowerText = text.toLowerCase();

  for (const [actionName, action] of Object.entries(manifest.actions)) {
    for (const keyword of action.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return actionName;
      }
    }
  }

  return null;
}
