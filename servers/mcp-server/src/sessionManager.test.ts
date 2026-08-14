import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MCPSessionManager } from './sessionManager.js';

function fakeSession(udid: string) {
  return {
    executor: {} as never,
    deviceUdid: udid,
    createdAt: new Date(),
    lastActivity: new Date(),
  };
}

describe('MCPSessionManager.ensureSession', () => {
  let mgr: MCPSessionManager;
  beforeEach(() => {
    mgr = new MCPSessionManager();
  });

  it('connects (auto-selecting a device) when no session is active', async () => {
    const connectSpy = vi.spyOn(mgr, 'connect').mockImplementation(async () => {
      // Simulate connect establishing the current session.
      (mgr as unknown as { currentSessionId: string | null }).currentSessionId = 'dev-1';
      (mgr as unknown as { sessions: Map<string, unknown> }).sessions.set('dev-1', fakeSession('dev-1'));
      return { sessionId: 'dev-1', deviceUdid: 'dev-1' };
    });

    await mgr.ensureSession();

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(mgr.hasSession('dev-1')).toBe(true);
  });

  it('is idempotent: does not reconnect when a session is already active', async () => {
    const connectSpy = vi
      .spyOn(mgr, 'connect')
      .mockResolvedValue({ sessionId: 'dev-1', deviceUdid: 'dev-1' });

    // Pre-establish an active session.
    (mgr as unknown as { currentSessionId: string | null }).currentSessionId = 'dev-1';
    (mgr as unknown as { sessions: Map<string, unknown> }).sessions.set('dev-1', fakeSession('dev-1'));

    await mgr.ensureSession();
    await mgr.ensureSession();

    expect(connectSpy).not.toHaveBeenCalled();
  });
});
