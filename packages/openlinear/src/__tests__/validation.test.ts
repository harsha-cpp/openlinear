import { describe, it, expect } from 'vitest';
import {
  FORBIDDEN_SYNC_FIELDS,
  isForbiddenField,
  sanitizePayload,
  validateExecutionMetadataSync,
  safeValidateExecutionMetadataSync,
  checkExecutionMetadataSync,
} from '../validation/security';

describe('Validation Security', () => {
  describe('isForbiddenField', () => {
    it('returns true for all forbidden fields', () => {
      for (const field of FORBIDDEN_SYNC_FIELDS) {
        expect(isForbiddenField(field)).toBe(true);
      }
    });

    it('returns false for allowed fields', () => {
      expect(isForbiddenField('taskId')).toBe(false);
      expect(isForbiddenField('runId')).toBe(false);
      expect(isForbiddenField('status')).toBe(false);
      expect(isForbiddenField('outcome')).toBe(false);
      expect(isForbiddenField('version')).toBe(false);
    });

    it('returns false for unknown fields', () => {
      expect(isForbiddenField('unknownField')).toBe(false);
      expect(isForbiddenField('')).toBe(false);
    });
  });

  describe('sanitizePayload', () => {
    it('removes all forbidden fields', () => {
      const payload = {
        taskId: 'tsk_123',
        runId: 'run_456',
        status: 'completed',
        prompt: 'secret prompt',
        logs: 'secret logs',
        accessToken: 'gho_abc',
        apiKey: 'sk-123',
      };

      const { sanitized, removed } = sanitizePayload(payload);

      expect(sanitized).toEqual({
        taskId: 'tsk_123',
        runId: 'run_456',
        status: 'completed',
      });
      expect(removed.sort()).toEqual(['accessToken', 'apiKey', 'logs', 'prompt']);
    });

    it('keeps allowed fields intact', () => {
      const payload = {
        taskId: 'tsk_123',
        runId: 'run_456',
        status: 'completed',
        version: '1.0',
        startedAt: '2026-02-27T10:00:00Z',
        durationMs: 90000,
        branch: 'feature/test',
        outcome: 'Success',
      };

      const { sanitized, removed } = sanitizePayload(payload);

      expect(sanitized).toEqual(payload);
      expect(removed).toEqual([]);
    });

    it('handles empty payload', () => {
      const { sanitized, removed } = sanitizePayload({});
      expect(sanitized).toEqual({});
      expect(removed).toEqual([]);
    });

    it('handles nested objects with forbidden fields', () => {
      const payload = {
        taskId: 'tsk_123',
        env: { DATABASE_URL: 'secret' },
      };

      const { sanitized, removed } = sanitizePayload(payload);

      expect(sanitized).toEqual({ taskId: 'tsk_123' });
      expect(removed).toEqual(['env']);
    });
  });

  describe('validateExecutionMetadataSync', () => {
    it('throws on invalid payload', () => {
      expect(() => validateExecutionMetadataSync({ invalid: true })).toThrow();
    });

    it('returns validated data for valid payload', () => {
      const payload = {
        taskId: 'tsk_123',
        runId: 'run_456',
        status: 'completed',
      };

      const result = validateExecutionMetadataSync(payload);
      expect(result.taskId).toBe('tsk_123');
      expect(result.runId).toBe('run_456');
      expect(result.status).toBe('completed');
    });

    it('throws on forbidden field', () => {
      const payload = {
        taskId: 'tsk_123',
        runId: 'run_456',
        status: 'completed',
        prompt: 'secret',
      };

      expect(() => validateExecutionMetadataSync(payload)).toThrow();
    });
  });

  describe('safeValidateExecutionMetadataSync', () => {
    it('returns success for valid payload', () => {
      const result = safeValidateExecutionMetadataSync({
        taskId: 'tsk_123',
        runId: 'run_456',
        status: 'running',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.taskId).toBe('tsk_123');
      }
    });

    it('returns failure for invalid payload', () => {
      const result = safeValidateExecutionMetadataSync({ invalid: true });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('returns failure for forbidden field', () => {
      const result = safeValidateExecutionMetadataSync({
        taskId: 'tsk_123',
        runId: 'run_456',
        status: 'completed',
        accessToken: 'secret',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('checkExecutionMetadataSync', () => {
    it('returns valid for valid payload', () => {
      const result = checkExecutionMetadataSync({
        taskId: 'tsk_123',
        runId: 'run_456',
        status: 'completed',
      });

      expect(result.valid).toBe(true);
      expect(result.issues).toBeUndefined();
    });

    it('returns issues for invalid payload', () => {
      const result = checkExecutionMetadataSync({
        taskId: 'tsk_123',
        status: 'invalid-status',
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toBeDefined();
      expect(result.issues!.length).toBeGreaterThan(0);
    });

    it('returns issues with field names', () => {
      const result = checkExecutionMetadataSync({
        taskId: 'tsk_123',
        runId: 'run_456',
        status: 'completed',
        prompt: 'secret',
      });

      expect(result.valid).toBe(false);
      expect(result.issues!.some(i => i.includes('prompt'))).toBe(true);
    });
  });
});
