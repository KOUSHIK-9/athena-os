import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as ReasonModule from './reason.js';

vi.mock('../sessionManager.js', () => {
  let executeMock: ((action: { type: string }) => Promise<unknown>) | null = null;

  return {
    mcpSessionManager: {
      getExecutor: () => ({
        execute: (action: { type: string }) => {
          if (executeMock) return executeMock(action);
          return Promise.resolve({ success: true, duration: 100 });
        },
        getSession: () => ({ id: 'test-session', deviceUdid: 'test-udid' }),
        getActiveApp: () => Promise.resolve({ bundleId: 'com.apple.Maps', name: 'Maps' }),
      }),
      connect: () => Promise.resolve({ sessionId: 'test-session', deviceUdid: 'test-udid' }),
      getActiveSessions: () => [],
    },
    __test: {
      setExecuteMock: (fn: typeof executeMock) => {
        executeMock = fn;
      },
    },
  };
});

// Capture the enriched re-plan prompt so we can assert state-aware fields flow through.
vi.mock('./reason.js', async () => {
  const actual = await vi.importActual<typeof ReasonModule>('./reason.js');
  const rePlanPrompts: string[] = [];
  return {
    ...actual,
    reasonForRun: (prompt: string, opts: { observation?: unknown } = {}) => {
      const real = actual.reasonForRun(prompt, { ...opts, backend: 'deterministic' });
      if (opts.observation) rePlanPrompts.push(real.intent.text);
      return real;
    },
    __test: { rePlanPrompts },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const testMock = (await import('../sessionManager.js')).__test as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reasonMock = (await import('./reason.js')).__test as any;

const { runOnDevice } = await import('./execute.js');

beforeEach(() => {
  testMock.setExecuteMock(null);
  reasonMock.rePlanPrompts.length = 0;
});

describe('state-aware planning recovery', () => {
  it('captures the foreground app and feeds it into the re-plan', async () => {
    let attempt = 0;
    testMock.setExecuteMock(() => {
      attempt += 1;
      return Promise.resolve(
        attempt <= 1
          ? { success: false, duration: 100, error: 'tap target missing' }
          : { success: true, duration: 100, verified: true }
      );
    });

    const outcome = await runOnDevice({ prompt: 'Open Settings', backend: 'deterministic' });

    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'executed') {
      expect(outcome.attempts).toBe(2);
    }
    expect(reasonMock.rePlanPrompts).toHaveLength(1);
    expect(reasonMock.rePlanPrompts[0]).toContain('Current app: Maps (com.apple.Maps)');
    expect(reasonMock.rePlanPrompts[0]).toContain('Original user goal: Open Settings');
  });
});
