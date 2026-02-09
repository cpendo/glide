// Glide Constants

// Design tokens (60-30-10 palette)
export const COLORS = {
  // 60% - Foundation
  background: '#F2E8CF',      // Champagne Mist
  text: '#386641',            // Hunter Green

  // 30% - Secondary
  secondary: '#6A994E',       // Sage

  // 10% - Accent (Ghost action)
  accent: '#BC4749',          // Blushed Brick
  accentAlt: '#A7C957',       // Yellow Green (alternative)
} as const;

// Timing constants
export const TYPING_DELAY = 50;        // ms between keystrokes
export const ACTION_DELAY = 300;       // ms between actions
export const RETRY_DELAY = 200;        // ms between retries
export const MAX_RETRIES = 5;          // max element find retries

// Ghost effect class names
export const GHOST_CLASS = 'glide-ghost-active';
export const GHOST_HIGHLIGHT_CLASS = 'glide-ghost-highlight';

// Storage keys
export const STORAGE_KEYS = {
  API_KEY: 'glide_gemini_api_key',
  COMMAND_HISTORY: 'glide_command_history',
  SETTINGS: 'glide_settings',
  LANGUAGE: 'glide_language',
} as const;

// Gemini API - Using Gemini 3 Flash for hackathon (required)
// Supports: systemInstruction, JSON mode, function calling, thinking mode
export const GEMINI_MODEL = "gemini-3-flash-preview";
export const GEMINI_MODEL_FALLBACK = "gemini-3-pro-preview"; // For complex commands

export const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Manifest schema versions
export const MANIFEST_SCHEMA_VERSIONS = {
  CURRENT: '1.0.0',
  SUPPORTED: ['1.0.0'],
} as const;
