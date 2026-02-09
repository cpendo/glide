// Background Service Worker - Handles Gemini API calls

import { parseCommand, setApiKey, hasApiKey } from './gemini';
import { enhanceManifestWithGemini } from './manifestEnhancer';
import type { GlideManifest, ExecutionPlan } from '../types';

// Message types
interface BaseMessage {
  type: string;
}

interface ParseCommandMessage extends BaseMessage {
  type: 'PARSE_COMMAND';
  command: string;
  manifest: GlideManifest;
  currentRoute: string | null;
}

interface SetApiKeyMessage extends BaseMessage {
  type: 'SET_API_KEY';
  apiKey: string;
}

interface CheckApiKeyMessage extends BaseMessage {
  type: 'CHECK_API_KEY';
}

interface PingMessage extends BaseMessage {
  type: 'PING';
}

interface EnhanceManifestMessage extends BaseMessage {
  type: 'ENHANCE_MANIFEST';
  manifest: GlideManifest;
  pageContext: string;
}

type Message = ParseCommandMessage | SetApiKeyMessage | CheckApiKeyMessage | PingMessage | EnhanceManifestMessage;

// Response types
interface SuccessResponse {
  type: 'SUCCESS';
  data?: unknown;
}

interface ErrorResponse {
  type: 'ERROR';
  error: string;
}

interface PlanResponse {
  type: 'PLAN';
  plan: ExecutionPlan;
}

interface ManifestResponse {
  type: 'MANIFEST';
  manifest: GlideManifest;
}

type Response = SuccessResponse | ErrorResponse | PlanResponse | ManifestResponse;

// Handle messages from popup/content
chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (response: Response) => void) => {
    handleMessage(message)
      .then(sendResponse)
      .catch(err => {
        console.error('[Glide Background] Error:', err);
        sendResponse({
          type: 'ERROR',
          error: err.message || 'An error occurred',
        });
      });

    return true; // Async response
  }
);

async function handleMessage(message: Message): Promise<Response> {
  switch (message.type) {
    case 'PING':
      return { type: 'SUCCESS' };

    case 'PARSE_COMMAND': {
      const { command, manifest, currentRoute } = message as ParseCommandMessage;

      if (!command || !manifest) {
        return { type: 'ERROR', error: 'Missing command or manifest' };
      }

      const plan = await parseCommand(command, manifest, currentRoute);
      return { type: 'PLAN', plan };
    }

    case 'SET_API_KEY': {
      const { apiKey } = message as SetApiKeyMessage;
      if (apiKey) {
        await setApiKey(apiKey);
        return { type: 'SUCCESS' };
      }
      return { type: 'ERROR', error: 'No API key provided' };
    }

    case 'CHECK_API_KEY': {
      const hasKey = await hasApiKey();
      return hasKey
        ? { type: 'SUCCESS' }
        : { type: 'ERROR', error: 'No API key configured' };
    }

    case 'ENHANCE_MANIFEST': {
      const { manifest, pageContext } = message as EnhanceManifestMessage;
      try {
        const enhanced = await enhanceManifestWithGemini(manifest, pageContext);
        return { type: 'MANIFEST', manifest: enhanced };
      } catch (e) {
        return { type: 'ERROR', error: e instanceof Error ? e.message : 'Enhancement failed' };
      }
    }

    default:
      return { type: 'ERROR', error: `Unknown message type: ${(message as BaseMessage).type}` };
  }
}

// Log service worker start
console.log('[Glide] Background service worker started');
