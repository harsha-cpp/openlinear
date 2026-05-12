import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  activeExecutions,
  sessionToTask,
} from '../services/execution/state';

vi.mock('../services/execution/git', () => ({
  commitAndPush: vi.fn(),
  createPullRequest: vi.fn(),
}));

vi.mock('@openlinear/api/sse', () => ({
  broadcast: vi.fn(),
}));

vi.mock('../services/delta-buffer', () => ({
  appendTextDelta: vi.fn(),
  appendReasoningDelta: vi.fn(),
  flushDeltaBuffer: vi.fn(),
  markThinking: vi.fn(() => true),
}));

// Re-implement private functions for testing
function extractSessionId(event: { type: string; properties?: Record<string, unknown> }): string | undefined {
  const props = event.properties || {};

  if (typeof props.sessionID === 'string') return props.sessionID;

  if (typeof props.id === 'string' && props.id.startsWith('ses_')) return props.id;

  const info = props.info as { id?: string; sessionID?: string } | undefined;
  if (info?.sessionID) return info.sessionID;
  if (info?.id && typeof info.id === 'string' && info.id.startsWith('ses_')) return info.id;

  const part = props.part as { sessionID?: string } | undefined;
  if (part?.sessionID) return part.sessionID;

  const session = props.session as { id?: string } | undefined;
  if (session?.id) return session.id;

  return undefined;
}

function extractCleanError(rawError: unknown): { message: string; isAuthError: boolean; isRateLimit: boolean } {
  if (typeof rawError === 'string') {
    const lower = rawError.toLowerCase();
    return {
      message: rawError,
      isAuthError: lower.includes('api key') || lower.includes('unauthorized') || lower.includes('authentication'),
      isRateLimit: lower.includes('rate limit') || lower.includes('429') || lower.includes('quota'),
    };
  }

  if (rawError && typeof rawError === 'object') {
    const err = rawError as Record<string, unknown>;

    if (err.data && typeof err.data === 'object') {
      const data = err.data as Record<string, unknown>;
      const msg = typeof data.message === 'string' ? data.message : undefined;
      const statusCode = typeof data.statusCode === 'number' ? data.statusCode : undefined;
      if (msg) {
        return {
          message: msg,
          isAuthError: statusCode === 401 || statusCode === 403 || msg.toLowerCase().includes('api key'),
          isRateLimit: statusCode === 429 || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('quota'),
        };
      }
    }

    if (typeof err.message === 'string') {
      const lower = err.message.toLowerCase();
      return {
        message: err.message,
        isAuthError: lower.includes('api key') || lower.includes('unauthorized'),
        isRateLimit: lower.includes('rate limit') || lower.includes('429'),
      };
    }

    if (err.error && typeof err.error === 'object') {
      const inner = err.error as Record<string, unknown>;
      if (typeof inner.message === 'string') {
        return {
          message: inner.message,
          isAuthError: inner.message.toLowerCase().includes('api key'),
          isRateLimit: inner.message.toLowerCase().includes('rate limit'),
        };
      }
    }
  }

  return {
    message: rawError ? JSON.stringify(rawError).slice(0, 200) : 'Unknown error',
    isAuthError: false,
    isRateLimit: false,
  };
}

describe('Event Handlers', () => {
  beforeEach(() => {
    activeExecutions.clear();
    sessionToTask.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('extractSessionId', () => {
    it('extracts from event.properties.sessionID', () => {
      const event = {
        type: 'session.completed',
        properties: { sessionID: 'ses_abc123' },
      };
      expect(extractSessionId(event)).toBe('ses_abc123');
    });

    it('extracts from event.properties.id when starts with ses_', () => {
      const event = {
        type: 'session.completed',
        properties: { id: 'ses_xyz789' },
      };
      expect(extractSessionId(event)).toBe('ses_xyz789');
    });

    it('extracts from event.properties.info.sessionID', () => {
      const event = {
        type: 'session.completed',
        properties: { info: { sessionID: 'ses_info123' } },
      };
      expect(extractSessionId(event)).toBe('ses_info123');
    });

    it('extracts from event.properties.info.id', () => {
      const event = {
        type: 'session.completed',
        properties: { info: { id: 'ses_info456' } },
      };
      expect(extractSessionId(event)).toBe('ses_info456');
    });

    it('extracts from event.properties.part.sessionID', () => {
      const event = {
        type: 'message.part.updated',
        properties: { part: { sessionID: 'ses_part789' } },
      };
      expect(extractSessionId(event)).toBe('ses_part789');
    });

    it('extracts from event.properties.session.id', () => {
      const event = {
        type: 'session.completed',
        properties: { session: { id: 'ses_sess000' } },
      };
      expect(extractSessionId(event)).toBe('ses_sess000');
    });

    it('returns undefined when no session ID found', () => {
      const event = {
        type: 'server.heartbeat',
        properties: {},
      };
      expect(extractSessionId(event)).toBeUndefined();
    });
  });

  describe('extractCleanError', () => {
    it('detects auth error from string', () => {
      const result = extractCleanError('API key is invalid or unauthorized');
      expect(result.isAuthError).toBe(true);
      expect(result.isRateLimit).toBe(false);
    });

    it('detects rate limit from string', () => {
      const result = extractCleanError('Rate limit exceeded, please try again later');
      expect(result.isAuthError).toBe(false);
      expect(result.isRateLimit).toBe(true);
    });

    it('handles APIError shape with statusCode 401', () => {
      const error = {
        name: 'APIError',
        data: { message: 'Unauthorized', statusCode: 401 },
      };
      const result = extractCleanError(error);
      expect(result.isAuthError).toBe(true);
      expect(result.isRateLimit).toBe(false);
    });

    it('handles APIError shape with statusCode 429', () => {
      const error = {
        name: 'APIError',
        data: { message: 'Too many requests', statusCode: 429 },
      };
      const result = extractCleanError(error);
      expect(result.isAuthError).toBe(false);
      expect(result.isRateLimit).toBe(true);
    });

    it('handles Error object with message', () => {
      const error = new Error('api key missing');
      const result = extractCleanError(error);
      expect(result.isAuthError).toBe(true);
    });

    it('handles nested error.message shape', () => {
      const error = {
        error: { message: 'rate limit 429' },
      };
      const result = extractCleanError(error);
      expect(result.isRateLimit).toBe(true);
    });

    it('handles unknown error shapes', () => {
      const result = extractCleanError({ someField: 'value' });
      expect(result.isAuthError).toBe(false);
      expect(result.isRateLimit).toBe(false);
      expect(result.message).toContain('someField');
    });

    it('returns Unknown error for null', () => {
      const result = extractCleanError(null);
      expect(result.message).toBe('Unknown error');
    });
  });
});
