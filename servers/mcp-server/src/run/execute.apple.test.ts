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

// Wrap the real reasoning so we exercise the genuine planning path, but keep
// the apple backend id stable (a real Apple on-device model is unavailable in
// CI). This proves the recovery loop never downgrades apple -> deterministic/openai.
vi.mock('./reason.js', async () => {
  const actual = await vi.importActual<typeof ReasonModule>('./reason.js');
  const calls: string[] = [];
  return {
    ...actual,
    reasonForRun: (prompt: string, opts: { backend?: string } = {}) => {
      calls.push(opts.backend ?? 'auto');
      const real = actual.reasonForRun(prompt, { ...opts, backend: 'deterministic' });
      const requested = opts.backend ?? 'auto';
      return {
        ...real,
        backendId: requested === 'apple' ? 'apple:system-language-model' : real.backendId,
      };
    },
    __test: { calls },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const testMock = (await import('../sessionManager.js')).__test as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reasonMock = (await import('./reason.js')).__test as any;

const { runOnDevice } = await import('./execute.js');

beforeEach(() => {
  testMock.setExecuteMock(null);
  reasonMock.calls.length = 0;
});

describe('apple backend is preserved through verification recovery', () => {
  it('re-plans with the apple backend after a verification failure', async () => {
    let attempt = 0;
    testMock.setExecuteMock(() => {
      attempt += 1;
      return Promise.resolve(
        attempt <= 1
          ? { success: false, duration: 100, error: 'verification failed' }
          : { success: true, duration: 100, verified: true }
      );
    });

    const outcome = await runOnDevice({ prompt: 'Open Settings', backend: 'apple' });

    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'executed') {
      expect(outcome.backendId).toBe('apple:system-language-model');
      expect(outcome.attempts).toBe(2);
    }
    // The runner passed the apple backend through on every re-plan — it never
    // silently switched to deterministic or an LLM backend.
    expect(reasonMock.calls).toEqual(['apple', 'apple']);
  });
});
