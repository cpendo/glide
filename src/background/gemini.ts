// Gemini API Integration - Gemini 3

import type { GlideManifest, ExecutionPlan, ExecutionStep } from '../types';
import { buildSystemPrompt, buildUserMessage } from './promptBuilder';
import { GEMINI_MODEL_FALLBACK, STORAGE_KEYS } from '../shared/constants';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message: string;
  };
}

interface ParsedResponse {
  intent: string;
  confidence: number;
  entities: Record<string, string>;
  steps: ExecutionStep[];
  confirmMessage: string;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Get API key from storage
async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  return result[STORAGE_KEYS.API_KEY] || null;
}

// Save API key to storage
export async function setApiKey(apiKey: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: apiKey });
}

// Check if API key is configured
export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey();
  return !!key;
}

// Make API call with retry logic (Gemini 3)
async function callGeminiAPI(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  retryCount = 0,
  useFallback = false
): Promise<GeminiResponse> {
  const model = useFallback ? GEMINI_MODEL_FALLBACK : 'gemini-3-flash-preview';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,  // API key in header, not URL
    },
    body: JSON.stringify({
      // System instruction - Gemini 3 feature for better context handling
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 0.8,
        maxOutputTokens: 2048,
        // JSON mode - Gemini 3 feature for structured output (schema-free for universal compatibility)
        responseMimeType: 'application/json',
      },
    }),
  });

  if (response.status === 429 && retryCount < MAX_RETRIES) {
    const errorData = await response.json().catch(() => ({}));
    const retryAfterMatch = errorData.error?.message?.match(/retry in (\d+\.?\d*)s/i);
    const retryDelay = retryAfterMatch
      ? parseFloat(retryAfterMatch[1]) * 1000
      : INITIAL_RETRY_DELAY * Math.pow(2, retryCount);

    console.log(`[Glide] Rate limited. Retrying in ${retryDelay}ms...`);
    await wait(retryDelay);
    return callGeminiAPI(systemPrompt, userMessage, apiKey, retryCount + 1, useFallback);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 429) {
      throw new Error('API quota exhausted. Please wait and try again.');
    }
    // Try fallback model on error (if not already using it)
    if (!useFallback && response.status >= 500) {
      console.log('[Glide] Primary model failed, trying fallback...');
      return callGeminiAPI(systemPrompt, userMessage, apiKey, retryCount, true);
    }
    throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
  }

  return response.json();
}

// Extract JSON from response (handles markdown code blocks)
function extractJson(text: string): string {
  // Try to find JSON in code blocks first
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  // Try to find raw JSON object
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0].trim();
  }

  // Otherwise assume the whole text is JSON
  return text.trim();
}

/**
 * Light pre-validation: only reject commands that are clearly too short/empty.
 * We let Gemini handle the actual entity extraction since it understands natural language
 * far better than keyword matching (e.g. "candy" is an item name even though it doesn't
 * match semantic hints like "name", "item", "product").
 */
function validateCommand(
  command: string,
  manifest: GlideManifest
): { valid: boolean; message: string | null } {
  const words = command.trim().split(/\s+/);

  // Reject very short commands (just a keyword with no data)
  if (words.length <= 1) {
    return { valid: false, message: 'Please provide more details in your command.' };
  }

  // Check if command matches at least one action's keywords
  const lowerCommand = command.toLowerCase();
  const hasKeywordMatch = Object.values(manifest.actions).some(action =>
    action.keywords.some(kw => lowerCommand.includes(kw.toLowerCase()))
  );

  if (!hasKeywordMatch) {
    // Still let Gemini try - it might understand the intent
    return { valid: true, message: null };
  }

  return { valid: true, message: null };
}

/**
 * Parse a natural language command using the manifest (Gemini 3)
 */
export async function parseCommand(
  command: string,
  manifest: GlideManifest,
  currentRoute: string | null
): Promise<ExecutionPlan> {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error('API key not configured. Please set your Gemini API key.');
  }

  // Light pre-validation
  const validation = validateCommand(command, manifest);
  if (!validation.valid) {
    return {
      id: `plan_${Date.now()}_validation`,
      intent: 'unknown',
      confidence: 0,
      entities: {},
      steps: [],
      confirmMessage: validation.message || 'Please provide more details.',
      currentStep: 0,
      status: 'pending',
    };
  }

  const systemPrompt = buildSystemPrompt(manifest, currentRoute);
  const userMessage = buildUserMessage(command);

  const response = await callGeminiAPI(systemPrompt, userMessage, apiKey);

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No response from Gemini');
  }

  try {
    const jsonStr = extractJson(text);
    const parsed: ParsedResponse = JSON.parse(jsonStr);

    // Generate a unique plan ID
    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return {
      id: planId,
      intent: parsed.intent || 'unknown',
      confidence: parsed.confidence ?? 0.5,
      entities: parsed.entities || {},
      steps: parsed.steps || [],
      confirmMessage: parsed.confirmMessage || 'Execute this action?',
      currentStep: 0,
      status: 'pending',
    };
  } catch (e) {
    console.error('[Glide] Failed to parse Gemini response:', text);
    throw new Error('Failed to understand the command. Please try rephrasing.');
  }
}
