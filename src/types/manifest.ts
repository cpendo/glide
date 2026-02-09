// Glide Manifest Schema - Defines app structure for natural language automation

export interface GlideManifest {
  $schema?: string;
  schemaVersion?: string;  // Manifest schema version (defaults to "1.0.0" if missing)
  app: AppInfo;
  navigation: Record<string, NavRoute>;
  actions: Record<string, GlideAction>;
  entities?: Record<string, string[]>;  // Domain-specific vocabulary
}

export interface AppInfo {
  name: string;
  version?: string;  // App version (separate from schema version)
  description?: string;
  baseUrl?: string;
}

export interface NavRoute {
  path: string;
  description: string;
  selector: string;  // How to navigate here (click this element)
  keywords?: string[];  // Words that indicate user wants this page
}

export interface GlideAction {
  description: string;
  keywords: string[];  // Trigger words: ["buy", "purchase", "bought"]
  route: string;  // Which nav route this action belongs to
  trigger?: ActionTrigger;  // How to open the form (click button, etc.)
  form: Record<string, FormField>;
  submit?: SubmitConfig;
}

export interface ActionTrigger {
  type: 'click' | 'navigate' | 'none';
  selector?: string;
  waitFor?: string;  // Wait for this element after trigger
  delay?: number;  // Additional delay in ms
}

export interface FormField {
  selector: string;
  type: 'text' | 'number' | 'email' | 'tel' | 'select' | 'textarea' | 'checkbox' | 'radio' | 'date';
  required?: boolean;
  semantic: string[];  // Words that map to this field: ["quantity", "amount", "how much"]
  options?: string[];  // For select fields
  default?: string;
}

export interface SubmitConfig {
  selector: string;
  waitFor?: string;  // Success indicator
  errorSelector?: string;  // Error indicator
  successMessage?: string;
}

// Execution types

export type ExecutionStepType =
  | 'navigate'
  | 'click'
  | 'wait'
  | 'fill'
  | 'select'
  | 'check'
  | 'submit'
  | 'notify'
  | 'find-row';

export interface ExecutionStep {
  type: ExecutionStepType;
  target?: string;  // Selector or route name
  value?: string;
  waitFor?: string;
  errorSelector?: string;
  message?: string;  // For notify steps
  action?: string;  // For find-row: "edit" | "delete"
}

export interface ExecutionPlan {
  id: string;
  intent: string;
  confidence: number;
  entities: Record<string, string>;  // Extracted values
  steps: ExecutionStep[];
  confirmMessage: string;
  currentStep: number;
  status: 'pending' | 'confirmed' | 'executing' | 'paused' | 'completed' | 'error';
  error?: string;
}

export interface ExecutionState {
  plan: ExecutionPlan;
  startedAt: number;
  lastUpdated: number;
}

/**
 * Validate manifest schema version
 * Returns true if version is supported, false otherwise
 */
export function validateManifestVersion(manifest: GlideManifest): boolean {
  const version = manifest.schemaVersion || '1.0.0';
  // For now, only support 1.0.0
  // Future versions can add compatibility checks here
  return version === '1.0.0';
}
