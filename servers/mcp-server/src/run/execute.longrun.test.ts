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

// Produce a fixed 10-step plan so we exercise a long-horizon task end to end.
vi.mock('./reason.js', async () => {
  const actual = await vi.importActual<typeof ReasonModule>('./reason.js');
  const rePlanObservations: unknown[] = [];
  const plan = {
    id: 'long-run-plan',
    steps: Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      capabilityId: 'wait',
      description: `Step ${i + 1}`,
    })),
  };
  return {
    ...actual,
    reasonForRun: (prompt: string, opts: { observation?: unknown } = {}) => {
      if (opts.observation) rePlanObservations.push(opts.observation);
      return {
        intent: actual.makeIntent(prompt),
        backendId: 'deterministic',
        originalPrompt: prompt,
        result: {
          kind: 'executionPlan' as const,
          plan,
          simulation: {},
          executionGraph: {},
        },
      };
    },
    __test: { rePlanObservations },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const testMock = (await import('../sessionManager.js')).__test as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reasonMock = (await import('./reason.js')).__test as any;

const { runOnDevice } = await import('./execute.js');

beforeEach(() => {
  testMock.setExecuteMock(null);
  reasonMock.rePlanObservations.length = 0;
});

describe('long-horizon autonomous task (10 steps)', () => {
  it('autonomously completes a 10-step task and recovers from one injected failure', async () => {
    // Inject a failure on the 5th wait execution (step index 4) of the first attempt.
    // On re-plan, the earlier verified steps (0-3) are preserved and only the
    // remaining steps (4-9) re-execute.
    let waitCalls = 0;
    testMock.setExecuteMock((action: { type: string }) => {
      if (action.type === 'getTree') {
        return Promise.resolve({
          success: true,
          duration: 10,
          metadata: { model: { root: { role: 'root' } } },
        });
      }
      if (action.type === 'wait') {
        waitCalls += 1;
        if (waitCalls === 5) {
          return Promise.resolve({ success: false, duration: 50, error: 'stale UI state' });
        }
        return Promise.resolve({ success: true, duration: 50, verified: true });
      }
      return Promise.resolve({ success: true, duration: 50, verified: true });
    });

    const outcome = await runOnDevice({
      prompt: 'Complete the 10-step setup',
      backend: 'deterministic',
    });

    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'executed') {
      // Recovered from the single injected failure.
      expect(outcome.attempts).toBe(2);
      // Every plan step was attempted and ultimately succeeded. The recovered
      // step (the injected failure) appears twice (once failed, once fixed);
      // the four already-verified steps appear exactly once (never repeated).
      const counts = new Map<string, number>();
      const lastSuccess = new Map<string, boolean>();
      for (const e of outcome.executed) {
        const key = e.stepId ?? `step-${e.stepIndex}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        lastSuccess.set(key, e.success);
      }
      expect(new Set(outcome.executed.map((e) => e.stepId)).size).toBe(10);
      expect([...lastSuccess.values()].every(Boolean)).toBe(true);
      for (let i = 0; i < 4; i += 1) expect(counts.get(`s${i}`)).toBe(1);
    }

    // The recovery observation told the planner what was already verified.
    expect(reasonMock.rePlanObservations).toHaveLength(1);
    const observation = reasonMock.rePlanObservations[0] as {
      accomplishedSteps: Array<{ description: string }>;
    };
    expect(observation.accomplishedSteps).toHaveLength(4);
    expect(observation.accomplishedSteps.map((s) => s.description)).toEqual([
      'Step 1',
      'Step 2',
      'Step 3',
      'Step 4',
    ]);
  });

  it('records the final state into task memory to prove completion', async () => {
    let waitCalls = 0;
    testMock.setExecuteMock((action: { type: string }) => {
      if (action.type === 'getTree') {
        return Promise.resolve({
          success: true,
          duration: 10,
          metadata: { model: { root: { role: 'root' } } },
        });
      }
      if (action.type === 'wait') {
        waitCalls += 1;
        if (waitCalls === 7) {
          return Promise.resolve({ success: false, duration: 50, error: 'unexpected navigation' });
        }
        return Promise.resolve({ success: true, duration: 50, verified: true });
      }
      return Promise.resolve({ success: true, duration: 50, verified: true });
    });

    const outcome = await runOnDevice({
      prompt: 'Complete the 10-step setup',
      backend: 'deterministic',
    });
    expect(outcome.success).toBe(true);

    // The runner records the complete run into TaskMemory; every plan step must
    // end verified (the single injected failure was recovered).
    const finalState = outcome.memory!;
    expect(finalState.status).toBe('completed');
    // 10 plan steps plus the final verification step.
    expect(finalState.steps).toHaveLength(11);
    expect(finalState.steps.every((s) => s.status === 'verified')).toBe(true);
  });
});
