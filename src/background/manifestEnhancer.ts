// Manifest Enhancer - Phase 2: Gemini-powered enhancement

import type { GlideManifest } from '../types/manifest';
import { GEMINI_MODEL, STORAGE_KEYS } from '../shared/constants';

// Get API key from storage
async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  return result[STORAGE_KEYS.API_KEY] || null;
}

/**
 * Enhance manifest with Gemini 3 - improves semantic hints, keywords, validates selectors
 */
export async function enhanceManifestWithGemini(
  draft: GlideManifest,
  pageContext: string
): Promise<GlideManifest> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API key not configured');
  }

  const prompt = buildEnhancementPrompt(draft, pageContext);
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: `You are a Glide manifest expert. Improve manifest files by:
1. Enhancing semantic hints for better entity extraction
2. Suggesting better keywords for actions
3. Validating selectors
4. Adding missing fields if obvious from context
5. Improving field descriptions

Return ONLY valid JSON matching the GlideManifest schema.`
        }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No response from Gemini');
  }

  try {
    // Extract JSON
    const jsonStr = extractJson(text);
    const enhanced = JSON.parse(jsonStr) as GlideManifest;

    // Merge with draft (preserve structure, enhance content)
    return mergeManifests(draft, enhanced);
  } catch (e) {
    console.error('[Glide] Failed to parse enhanced manifest:', e);
    throw new Error('Failed to parse enhanced manifest');
  }
}

/**
 * Build enhancement prompt
 */
function buildEnhancementPrompt(draft: GlideManifest, pageContext: string): string {
  return `Enhance this Glide manifest:

Current manifest:
\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

Page context:
${pageContext}

Improve:
1. Semantic hints - add more synonyms and variations
2. Keywords - add common phrases users might say
3. Field types - ensure correct types (text, number, email, tel, select)
4. Selectors - validate they're specific enough
5. Descriptions - make them clearer

Return the enhanced manifest as JSON.`;
}

/**
 * Extract JSON from response
 */
function extractJson(text: string): string {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0].trim();
  }

  return text.trim();
}

/**
 * Merge enhanced manifest with draft (preserve user edits)
 */
function mergeManifests(draft: GlideManifest, enhanced: GlideManifest): GlideManifest {
  // Start with draft
  const merged: GlideManifest = {
    ...draft,
    schemaVersion: draft.schemaVersion || enhanced.schemaVersion,
  };

  // Enhance actions
  for (const [actionName, draftAction] of Object.entries(draft.actions)) {
    const enhancedAction = enhanced.actions[actionName];
    if (enhancedAction) {
      merged.actions[actionName] = {
        ...draftAction,
        // Merge keywords (union)
        keywords: [...new Set([...draftAction.keywords, ...enhancedAction.keywords])],
        description: enhancedAction.description || draftAction.description,
        // Enhance form fields
        form: mergeFormFields(draftAction.form, enhancedAction.form),
      };
    }
  }

  // Enhance navigation descriptions
  for (const [routeName, route] of Object.entries(merged.navigation)) {
    const enhancedRoute = enhanced.navigation[routeName];
    if (enhancedRoute) {
      merged.navigation[routeName] = {
        ...route,
        description: enhancedRoute.description || route.description,
      };
    }
  }

  return merged;
}

/**
 * Merge form fields
 */
function mergeFormFields(
  draftFields: GlideManifest['actions'][string]['form'],
  enhancedFields: GlideManifest['actions'][string]['form']
): GlideManifest['actions'][string]['form'] {
  const merged: GlideManifest['actions'][string]['form'] = {};

  for (const [fieldName, draftField] of Object.entries(draftFields)) {
    const enhancedField = enhancedFields[fieldName];
    if (enhancedField) {
      merged[fieldName] = {
        ...draftField,
        // Merge semantic hints (union)
        semantic: [...new Set([...draftField.semantic, ...enhancedField.semantic])],
        type: enhancedField.type || draftField.type,
        required: draftField.required, // Preserve draft required status
        options: enhancedField.options || draftField.options,
      };
    } else {
      merged[fieldName] = draftField;
    }
  }

  return merged;
}
