import { describe, it, expect, beforeEach } from 'vitest';
import {
  broadcast,
  sendToClient,
  getClientCount,
  clients,
} from '../sse';

describe('SSE', () => {
  beforeEach(() => {
    clients.clear();
  });

  it('starts with zero clients', () => {
    expect(getClientCount()).toBe(0);
  });

  it('broadcasts to all connected clients', () => {
    const mockRes1 = { write: vi.fn(), writableEnded: false };
    const mockRes2 = { write: vi.fn(), writableEnded: false };

    clients.set('client-1', { id: 'client-1', res: mockRes1 as any });
    clients.set('client-2', { id: 'client-2', res: mockRes2 as any });

    broadcast('task:updated', { id: 'task-1', status: 'done' });

    expect(mockRes1.write).toHaveBeenCalledTimes(1);
    expect(mockRes2.write).toHaveBeenCalledTimes(1);

    const expectedMessage = `event: task:updated\ndata: ${JSON.stringify({ id: 'task-1', status: 'done' })}\n\n`;
    expect(mockRes1.write).toHaveBeenCalledWith(expectedMessage);
    expect(mockRes2.write).toHaveBeenCalledWith(expectedMessage);
  });

  it('does not broadcast to ended clients', () => {
    const mockRes1 = { write: vi.fn(), writableEnded: false };
    const mockRes2 = { write: vi.fn(), writableEnded: true };

    clients.set('client-1', { id: 'client-1', res: mockRes1 as any });
    clients.set('client-2', { id: 'client-2', res: mockRes2 as any });

    broadcast('task:updated', { id: 'task-1' });

    expect(mockRes1.write).toHaveBeenCalledTimes(1);
    expect(mockRes2.write).not.toHaveBeenCalled();
  });

  it('sends to specific client', () => {
    const mockRes = { write: vi.fn(), writableEnded: false };
    clients.set('client-1', { id: 'client-1', res: mockRes as any });

    const result = sendToClient('client-1', 'execution:progress', { taskId: 'task-1' });

    expect(result).toBe(true);
    expect(mockRes.write).toHaveBeenCalledTimes(1);
  });

  it('returns false when client not found', () => {
    const result = sendToClient('non-existent', 'event', {});
    expect(result).toBe(false);
  });

  it('returns false when client stream ended', () => {
    const mockRes = { write: vi.fn(), writableEnded: true };
    clients.set('client-1', { id: 'client-1', res: mockRes as any });

    const result = sendToClient('client-1', 'event', {});
    expect(result).toBe(false);
  });

  it('tracks client count', () => {
    expect(getClientCount()).toBe(0);

    clients.set('client-1', { id: 'client-1', res: {} as any });
    expect(getClientCount()).toBe(1);

    clients.set('client-2', { id: 'client-2', res: {} as any });
    expect(getClientCount()).toBe(2);

    clients.delete('client-1');
    expect(getClientCount()).toBe(1);
  });

  it('does not log for non-execution events', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mockRes = { write: vi.fn(), writableEnded: false };
    clients.set('client-1', { id: 'client-1', res: mockRes as any });

    broadcast('task:updated', { id: 'task-1' });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('logs for execution events', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mockRes = { write: vi.fn(), writableEnded: false };
    clients.set('client-1', { id: 'client-1', res: mockRes as any });

    broadcast('execution:started', { taskId: 'task-1' });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Broadcast execution:started'));
    consoleSpy.mockRestore();
  });
});

import { vi } from 'vitest';
