import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFeatureFlags } from '../config/feature-flags';
import { initOpenCode, getOpenCodeStatus } from '../services/opencode';

vi.mock('../config/feature-flags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/feature-flags')>();
  return {
    ...actual,
    getFeatureFlags: vi.fn(),
  };
});

vi.mock('../sse', () => ({
  broadcast: vi.fn(),
}));

describe('Feature Flags Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run in local-only mode when server execution is disabled', async () => {
    vi.mocked(getFeatureFlags).mockReturnValue({
      LOCAL_EXECUTION_ENABLED: true,
      SERVER_EXECUTION_ENABLED: false,
      CANARY_PERCENTAGE: 100,
      FORCE_LOCAL_EXECUTION: false,
      KILL_SWITCH_LOCAL_EXECUTION: false,
    });

    await initOpenCode();

    expect(getOpenCodeStatus().mode).toBe('local-only');
  });

  it('should throw error on startup if both execution modes are disabled', async () => {
    vi.mocked(getFeatureFlags).mockReturnValue({
      LOCAL_EXECUTION_ENABLED: false,
      SERVER_EXECUTION_ENABLED: false,
      CANARY_PERCENTAGE: 0,
      FORCE_LOCAL_EXECUTION: false,
      KILL_SWITCH_LOCAL_EXECUTION: false,
    });

    await expect(initOpenCode()).rejects.toThrow('Invalid feature flag configuration: At least one execution mode must be enabled');
  });

  it('should throw error on startup if both force and kill switch are enabled', async () => {
    vi.mocked(getFeatureFlags).mockReturnValue({
      LOCAL_EXECUTION_ENABLED: true,
      SERVER_EXECUTION_ENABLED: true,
      CANARY_PERCENTAGE: 0,
      FORCE_LOCAL_EXECUTION: true,
      KILL_SWITCH_LOCAL_EXECUTION: true,
    });

    await expect(initOpenCode()).rejects.toThrow('Invalid feature flag configuration: Cannot enable both FORCE_LOCAL_EXECUTION and KILL_SWITCH_LOCAL_EXECUTION');
  });
});
