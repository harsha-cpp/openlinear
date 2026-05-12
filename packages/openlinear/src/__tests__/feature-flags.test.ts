import { describe, it, expect } from 'vitest';
import {
  parseFeatureFlags,
  isLocalExecutionEnabled,
  isServerExecutionEnabled,
  validateFlagConfiguration,
  getMigrationPhase,
} from '../config/feature-flags';

describe('Feature Flags', () => {
  describe('parseFeatureFlags', () => {
    it('returns defaults with empty env', () => {
      const flags = parseFeatureFlags({});
      expect(flags.LOCAL_EXECUTION_ENABLED).toBe(false);
      expect(flags.SERVER_EXECUTION_ENABLED).toBe(true);
      expect(flags.CANARY_PERCENTAGE).toBe(0);
      expect(flags.FORCE_LOCAL_EXECUTION).toBe(false);
      expect(flags.KILL_SWITCH_LOCAL_EXECUTION).toBe(false);
    });

    it('parses boolean flags from strings', () => {
      const flags = parseFeatureFlags({
        LOCAL_EXECUTION_ENABLED: 'true',
        SERVER_EXECUTION_ENABLED: 'false',
        FORCE_LOCAL_EXECUTION: 'true',
        KILL_SWITCH_LOCAL_EXECUTION: 'true',
      });

      expect(flags.LOCAL_EXECUTION_ENABLED).toBe(true);
      expect(flags.SERVER_EXECUTION_ENABLED).toBe(false);
      expect(flags.FORCE_LOCAL_EXECUTION).toBe(true);
      expect(flags.KILL_SWITCH_LOCAL_EXECUTION).toBe(true);
    });

    it('parses canary percentage', () => {
      const flags = parseFeatureFlags({ CANARY_PERCENTAGE: '25' });
      expect(flags.CANARY_PERCENTAGE).toBe(25);
    });

    it('rejects invalid canary percentage', () => {
      expect(() => parseFeatureFlags({ CANARY_PERCENTAGE: '101' })).toThrow();
      expect(() => parseFeatureFlags({ CANARY_PERCENTAGE: '-1' })).toThrow();
    });
  });

  describe('isLocalExecutionEnabled', () => {
    it('returns false when kill switch is active', () => {
      const flags = parseFeatureFlags({
        KILL_SWITCH_LOCAL_EXECUTION: 'true',
        LOCAL_EXECUTION_ENABLED: 'true',
        FORCE_LOCAL_EXECUTION: 'true',
      });
      expect(isLocalExecutionEnabled('user-1', flags)).toBe(false);
    });

    it('returns true when force flag is active', () => {
      const flags = parseFeatureFlags({
        FORCE_LOCAL_EXECUTION: 'true',
        LOCAL_EXECUTION_ENABLED: 'false',
      });
      expect(isLocalExecutionEnabled('user-1', flags)).toBe(true);
    });

    it('returns false when local execution is disabled', () => {
      const flags = parseFeatureFlags({
        LOCAL_EXECUTION_ENABLED: 'false',
      });
      expect(isLocalExecutionEnabled('user-1', flags)).toBe(false);
    });

    it('returns true when canary is 100%', () => {
      const flags = parseFeatureFlags({
        LOCAL_EXECUTION_ENABLED: 'true',
        CANARY_PERCENTAGE: '100',
      });
      expect(isLocalExecutionEnabled('user-1', flags)).toBe(true);
    });

    it('returns false when canary is 0%', () => {
      const flags = parseFeatureFlags({
        LOCAL_EXECUTION_ENABLED: 'true',
        CANARY_PERCENTAGE: '0',
      });
      expect(isLocalExecutionEnabled('user-1', flags)).toBe(false);
    });

    it('consistently routes same user to same result with canary', () => {
      const flags = parseFeatureFlags({
        LOCAL_EXECUTION_ENABLED: 'true',
        CANARY_PERCENTAGE: '50',
      });

      const userId = 'test-user-abc';
      const firstResult = isLocalExecutionEnabled(userId, flags);
      const secondResult = isLocalExecutionEnabled(userId, flags);

      expect(firstResult).toBe(secondResult);
    });
  });

  describe('isServerExecutionEnabled', () => {
    it('returns true by default', () => {
      const flags = parseFeatureFlags({});
      expect(isServerExecutionEnabled(flags)).toBe(true);
    });

    it('returns false when disabled', () => {
      const flags = parseFeatureFlags({ SERVER_EXECUTION_ENABLED: 'false' });
      expect(isServerExecutionEnabled(flags)).toBe(false);
    });
  });

  describe('validateFlagConfiguration', () => {
    it('returns valid for default flags', () => {
      const flags = parseFeatureFlags({});
      const result = validateFlagConfiguration(flags);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('detects force + kill switch conflict', () => {
      const flags = parseFeatureFlags({
        FORCE_LOCAL_EXECUTION: 'true',
        KILL_SWITCH_LOCAL_EXECUTION: 'true',
      });
      const result = validateFlagConfiguration(flags);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cannot enable both FORCE_LOCAL_EXECUTION and KILL_SWITCH_LOCAL_EXECUTION');
    });

    it('detects no execution mode enabled', () => {
      const flags = parseFeatureFlags({
        LOCAL_EXECUTION_ENABLED: 'false',
        SERVER_EXECUTION_ENABLED: 'false',
      });
      const result = validateFlagConfiguration(flags);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one execution mode must be enabled');
    });
  });

  describe('getMigrationPhase', () => {
    it('returns rollback when kill switch is active', () => {
      const flags = parseFeatureFlags({ KILL_SWITCH_LOCAL_EXECUTION: 'true' });
      expect(getMigrationPhase(flags)).toBe('rollback');
    });

    it('returns cutover when server execution is disabled', () => {
      const flags = parseFeatureFlags({
        LOCAL_EXECUTION_ENABLED: 'true',
        SERVER_EXECUTION_ENABLED: 'false',
      });
      expect(getMigrationPhase(flags)).toBe('cutover');
    });

    it('returns canary when local enabled with canary > 0', () => {
      const flags = parseFeatureFlags({
        LOCAL_EXECUTION_ENABLED: 'true',
        CANARY_PERCENTAGE: '10',
      });
      expect(getMigrationPhase(flags)).toBe('canary');
    });

    it('returns shadow when local enabled with canary = 0', () => {
      const flags = parseFeatureFlags({
        LOCAL_EXECUTION_ENABLED: 'true',
        CANARY_PERCENTAGE: '0',
      });
      expect(getMigrationPhase(flags)).toBe('shadow');
    });

    it('returns unknown for unrecognized state', () => {
      const flags = parseFeatureFlags({
        LOCAL_EXECUTION_ENABLED: 'false',
        SERVER_EXECUTION_ENABLED: 'true',
      });
      expect(getMigrationPhase(flags)).toBe('unknown');
    });
  });
});
