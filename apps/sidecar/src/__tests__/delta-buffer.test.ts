import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getOrCreateBuffer,
  markThinking,
  appendTextDelta,
  appendReasoningDelta,
  flushDeltaBuffer,
  cleanupDeltaBuffer,
} from '../services/delta-buffer';

describe('DeltaBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    cleanupDeltaBuffer('task-1');
    vi.useRealTimers();
  });

  it('creates a buffer on first access', () => {
    const emitted: string[] = [];
    getOrCreateBuffer('task-1', (msg) => emitted.push(msg));
    expect(emitted).toEqual([]);
  });

  it('markThinking returns true on first call, false on subsequent', () => {
    getOrCreateBuffer('task-1', () => {});
    expect(markThinking('task-1')).toBe(true);
    expect(markThinking('task-1')).toBe(false);
    expect(markThinking('task-1')).toBe(false);
  });

  it('appends text delta and flushes after debounce', () => {
    const emitted: string[] = [];
    getOrCreateBuffer('task-1', (msg) => emitted.push(msg));

    appendTextDelta('task-1', 'Hello ');
    appendTextDelta('task-1', 'world');

    expect(emitted).toEqual([]);

    vi.advanceTimersByTime(800);

    expect(emitted).toEqual(['Hello world']);
  });

  it('does not emit empty text after flush', () => {
    const emitted: string[] = [];
    getOrCreateBuffer('task-1', (msg) => emitted.push(msg));

    appendTextDelta('task-1', '   ');

    vi.advanceTimersByTime(800);

    expect(emitted).toEqual([]);
  });

  it('appends reasoning delta and flushes with prefix', () => {
    const emitted: string[] = [];
    getOrCreateBuffer('task-1', (msg) => emitted.push(msg));

    appendReasoningDelta('task-1', 'Analyzing');
    appendReasoningDelta('task-1', ' code...');

    expect(emitted).toEqual([]);

    vi.advanceTimersByTime(800);

    expect(emitted).toEqual(['Thinking: Analyzing code...']);
  });

  it('caps reasoning output at 200 chars', () => {
    const emitted: string[] = [];
    getOrCreateBuffer('task-1', (msg) => emitted.push(msg));

    const longReasoning = 'a'.repeat(250);
    appendReasoningDelta('task-1', longReasoning);

    vi.advanceTimersByTime(800);

    expect(emitted.length).toBe(1);
    expect(emitted[0]).toBe(`Thinking: ${'a'.repeat(200)}`);
  });

  it('flushDeltaBuffer clears both text and reasoning', () => {
    const emitted: string[] = [];
    getOrCreateBuffer('task-1', (msg) => emitted.push(msg));

    appendTextDelta('task-1', 'text');
    appendReasoningDelta('task-1', 'reason');

    flushDeltaBuffer('task-1');

    expect(emitted).toEqual(['text', 'Thinking: reason']);

    appendTextDelta('task-1', 'more');
    vi.advanceTimersByTime(800);

    expect(emitted).toEqual(['text', 'Thinking: reason', 'more']);
  });

  it('cleanupDeltaBuffer removes buffer and cancels timers', () => {
    const emitted: string[] = [];
    getOrCreateBuffer('task-1', (msg) => emitted.push(msg));

    appendTextDelta('task-1', 'pending');
    cleanupDeltaBuffer('task-1');

    vi.advanceTimersByTime(800);

    expect(emitted).toEqual([]);
  });

  it('handles non-existent task gracefully', () => {
    expect(() => markThinking('non-existent')).not.toThrow();
    expect(() => appendTextDelta('non-existent', 'text')).not.toThrow();
    expect(() => appendReasoningDelta('non-existent', 'reason')).not.toThrow();
    expect(() => flushDeltaBuffer('non-existent')).not.toThrow();
    expect(() => cleanupDeltaBuffer('non-existent')).not.toThrow();
  });
});
