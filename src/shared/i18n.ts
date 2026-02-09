// Internationalization (i18n) - Multilingual UI support

import { STORAGE_KEYS } from './constants';

export type Language = 'en' | 'sw';

export interface Translations {
  ui: {
    ready: string;
    processing: string;
    confirming: string;
    executing: string;
    done: string;
    error: string;
    execute: string;
    cancel: string;
    stop: string;
    noManifest: string;
    apiKeyRequired: string;
    settings: string;
    language: string;
    english: string;
    swahili: string;
  };
  steps: {
    navigate: string;
    click: string;
    fill: string;
    select: string;
    submit: string;
    wait: string;
  };
  errors: {
    apiKeyMissing: string;
    commandFailed: string;
    executionFailed: string;
    cancelled: string;
  };
}

const translations: Record<Language, Translations> = {
  en: {
    ui: {
      ready: 'Ready',
      processing: 'Understanding...',
      confirming: 'Review plan',
      executing: 'Executing...',
      done: 'Done!',
      error: 'Error',
      execute: 'Execute',
      cancel: 'Cancel',
      stop: 'Stop',
      noManifest: 'No Manifest Found',
      apiKeyRequired: 'API Key Required',
      settings: 'Settings',
      language: 'Language',
      english: 'English',
      swahili: 'Swahili',
    },
    steps: {
      navigate: 'Navigate',
      click: 'Click',
      fill: 'Fill',
      select: 'Select',
      submit: 'Submit',
      wait: 'Wait',
    },
    errors: {
      apiKeyMissing: 'API key not configured',
      commandFailed: 'Failed to understand command',
      executionFailed: 'Execution failed',
      cancelled: 'Cancelled',
    },
  },
  sw: {
    ui: {
      ready: 'Tayari',
      processing: 'Inaelewa...',
      confirming: 'Angalia mpango',
      executing: 'Inatekeleza...',
      done: 'Imekamilika!',
      error: 'Hitilafu',
      execute: 'Tekeleza',
      cancel: 'Ghairi',
      stop: 'Acha',
      noManifest: 'Hakuna Manifest Imepatikana',
      apiKeyRequired: 'Ufunguo wa API Unahitajika',
      settings: 'Mipangilio',
      language: 'Lugha',
      english: 'Kiingereza',
      swahili: 'Kiswahili',
    },
    steps: {
      navigate: 'Nenda',
      click: 'Bofya',
      fill: 'Jaza',
      select: 'Chagua',
      submit: 'Wasilisha',
      wait: 'Subiri',
    },
    errors: {
      apiKeyMissing: 'Ufunguo wa API haujasanidiwa',
      commandFailed: 'Imeshindwa kuelewa amri',
      executionFailed: 'Utekelezaji umeshindwa',
      cancelled: 'Imeghairiwa',
    },
  },
};

let currentLanguage: Language = 'en';

/**
 * Initialize i18n - load saved language from storage
 */
export async function initI18n(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.LANGUAGE);
    if (result[STORAGE_KEYS.LANGUAGE]) {
      currentLanguage = result[STORAGE_KEYS.LANGUAGE] as Language;
    }
  } catch (e) {
    console.warn('[Glide] Failed to load language preference:', e);
  }
}

/**
 * Get translation for a key
 */
export function t(key: string, params?: Record<string, string>): string {
  const keys = key.split('.');
  let value: any = translations[currentLanguage];

  for (const k of keys) {
    value = value?.[k];
    if (value === undefined) {
      console.warn(`[Glide] Missing translation: ${key}`);
      // Fallback to English
      value = translations.en;
      for (const k2 of keys) {
        value = value?.[k2];
      }
      break;
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // Replace params
  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
      return params[paramKey] || match;
    });
  }

  return value;
}

/**
 * Set current language
 */
export async function setLanguage(lang: Language): Promise<void> {
  currentLanguage = lang;
  await chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: lang });
}

/**
 * Get current language
 */
export function getLanguage(): Language {
  return currentLanguage;
}
