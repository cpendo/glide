// Popup State Management with Zustand

import { create } from 'zustand';
import type { GlideState, GlideManifest, ExecutionPlan, GlideStatus } from '../types';
import type { Language } from '../shared/i18n';

interface GlideStore {
  // State
  state: GlideState;
  status: GlideStatus | null;
  manifest: GlideManifest | null;
  plan: ExecutionPlan | null;
  command: string;
  error: string | null;
  hasApiKey: boolean;
  language: Language;

  // Execution progress
  currentStep: number;
  totalSteps: number;
  stepMessage: string;

  // History
  commandHistory: string[];

  // Actions
  setState: (state: GlideState) => void;
  setStatus: (status: GlideStatus | null) => void;
  setManifest: (manifest: GlideManifest | null) => void;
  setPlan: (plan: ExecutionPlan | null) => void;
  setCommand: (command: string) => void;
  setError: (error: string | null) => void;
  setHasApiKey: (hasKey: boolean) => void;
  setProgress: (step: number, total: number, message: string) => void;
  setLanguage: (lang: Language) => void;
  addToHistory: (command: string) => void;
  reset: () => void;
}

export const useGlideStore = create<GlideStore>((set, get) => ({
  state: 'idle',
  status: null,
  manifest: null,
  plan: null,
  command: '',
  error: null,
  hasApiKey: false,
  language: 'en',
  currentStep: 0,
  totalSteps: 0,
  stepMessage: '',
  commandHistory: [],

  setState: (state) => set({ state }),
  setStatus: (status) => set({ status, state: status?.state || 'idle' }),
  setManifest: (manifest) => set({ manifest }),
  setPlan: (plan) => set({ plan }),
  setCommand: (command) => set({ command }),
  setError: (error) => set({ error, state: error ? 'error' : get().state }),
  setHasApiKey: (hasApiKey) => set({ hasApiKey }),
  setLanguage: (language) => set({ language }),

  setProgress: (currentStep, totalSteps, stepMessage) =>
    set({ currentStep, totalSteps, stepMessage }),

  addToHistory: (command) =>
    set((state) => ({
      commandHistory: [command, ...state.commandHistory.filter((c) => c !== command)].slice(0, 10),
    })),

  reset: () =>
    set({
      state: 'idle',
      plan: null,
      error: null,
      currentStep: 0,
      totalSteps: 0,
      stepMessage: '',
    }),
}));
