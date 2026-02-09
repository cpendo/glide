// Glide Types - Universal form automation

// Re-export manifest types
export * from './manifest';

// Extension state machine
export type GlideState =
  | 'idle'
  | 'loading-manifest'
  | 'ready'
  | 'processing'
  | 'confirming'
  | 'executing'
  | 'paused'
  | 'done'
  | 'error'
  | 'no-manifest';

// Message between popup and content/background
export interface GlideStatus {
  state: GlideState;
  manifestLoaded: boolean;
  appName?: string;
  currentRoute?: string;
  error?: string;
}

// Legacy types for backwards compatibility (will phase out)
export interface ScannedElement {
  id: string;
  tagName: 'input' | 'select' | 'textarea' | 'button';
  inputType?: string;
  label: string;
  selectors: SelectorChain;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  currentValue?: string;
}

export interface SelectorChain {
  primary: string;
  fallbacks: string[];
}

export interface PageSchema {
  url: string;
  title: string;
  elements: ScannedElement[];
  scannedAt: number;
}

// Result of executing an action plan
export interface ExecutionResult {
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  message: string;
  errors?: string[];
  navigating?: boolean;  // True if execution paused for navigation
  cancelled?: boolean;  // True if execution was cancelled
}

// Scanned page data for manifest generation
export interface ScannedPageData {
  navigation: Array<{
    path: string;
    selector: string;
    label: string;
  }>;
  forms: Array<{
    route?: string;          // Which route/page this form was found on
    triggerLabel?: string;    // Text of the button that opens this form (e.g. "Add Stock")
    trigger?: {
      selector: string;
      type: 'click';
    };
    fields: Array<{
      selector: string;
      label: string;
      type: string;
      required: boolean;
      options?: string[];
      semantic: string[];
    }>;
    submit?: {
      selector: string;
    };
  }>;
}

// Message types for communication between popup/content/background
export type MessageType =
  | 'PING'
  | 'PONG'
  | 'CHECK_API_KEY'
  | 'SET_API_KEY'
  | 'PARSE_COMMAND'
  | 'PLAN'
  | 'GET_STATUS'
  | 'STATUS'
  | 'GET_MANIFEST'
  | 'MANIFEST'
  | 'EXECUTE_PLAN'
  | 'EXECUTION_RESULT'
  | 'CANCEL_EXECUTION'
  | 'SCAN_PAGE'
  | 'SCAN_RESULT'
  | 'GENERATE_MANIFEST'
  | 'ENHANCE_MANIFEST'
  | 'ERROR';
