import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { reasonForRun } from './reason.js';

/**
 * Recovery-architecture regression tests.
 *
 * Exercise the plan-agnostic recovery loop with a fully mocked executor and a
 * controlled planner (no real Apple model, no real device). The planner returns
 * plan A on attempt 1 and a DIFFERENT plan (different length, reordered,
 * re-listing accomplished steps) on the recovery re-plan — proving recovery
 * tracks accomplished work by stable semantic identity, not by position.
 */

vi.mock('../sessionManager.js', () => {
  let executeMock: ((action: { type: string; text?: string }) => Promise<unknown>) | null = null;
  return {
    mcpSessionManager: {
      getExecutor: () => ({
        execute: (action: { type: string; text?: string }) =>
          executeMock ? executeMock(action) : Promise.resolve({ success: true, duration: 100 }),
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

interface SessionTest {
  setExecuteMock: (
    fn: ((action: { type: string; text?: string }) => Promise<unknown>) | null
  ) => void;
}

const sessionMock = (await import('../sessionManager.js')).__test as unknown as SessionTest;

type StepSpec = {
  id: string;
  goalId: string;
  cap: 'launchApp' | 'tap' | 'type';
  target: string;
};

function buildPlan(specs: StepSpec[]) {
  const goals = specs.map((s) => ({
    id: s.goalId,
    kind: s.cap,
    description:
      s.cap === 'launchApp'
        ? `Open "${s.target}"`
        : s.cap === 'type'
          ? `Type "${s.target}"`
          : `Tap "${s.target}"`,
    target: s.cap === 'launchApp' || s.cap === 'type' ? s.target : undefined,
  }));
  const steps = specs.map((s) => ({
    id: s.id,
    goalId: s.goalId,
    capabilityId: s.cap,
    action: s.cap,
    description: `${s.cap} ${s.target}`,
    dependsOn: [] as string[],
  }));
  return { intent: { text: 'goal', goals }, plan: { id: 'plan', intentId: 'intent', steps } };
}

function makeReasonForRun(
  planA: ReturnType<typeof buildPlan>,
  planB: ReturnType<typeof buildPlan>
) {
  const backendsUsed: string[] = [];
  const planStepCounts: number[] = [];
  const fn = ((p: string, opts: { backend?: string; observation?: unknown }) => {
    backendsUsed.push(opts?.backend ?? 'auto');
    const chosen = opts?.observation ? planB : planA;
    planStepCounts.push(chosen.plan.steps.length);
    return {
      intent: chosen.intent,
      backendId: 'apple:system-language-model',
      originalPrompt: p,
      result: {
        kind: 'executionPlan' as const,
        plan: chosen.plan,
        goals: chosen.intent.goals,
        simulation: {},
        executionGraph: {},
      },
    };
  }) as unknown as typeof reasonForRun;
  return { fn, backendsUsed, planStepCounts };
}

function executedKey(e: { capabilityId: string; description: string }): string {
  const d = e.description.toLowerCase();
  const m = d.match(/^(?:launch|type:?|tap)\s+(.+)$/);
  const target = m ? m[1].replace(/"/g, '').trim() : d;
  return `${e.capabilityId}::${target}`;
}

const { runOnDevice } = await import('./execute.js');

beforeEach(() => {
  sessionMock.setExecuteMock(null);
});

describe('recovery tracks accomplished work by stable semantic identity', () => {
  it('skips accomplished steps across reordered, re-listed recovery plans', async () => {
    const planA = buildPlan([
      { id: 's1', goalId: 'g1', cap: 'launchApp', target: 'Settings' },
      { id: 's2', goalId: 'g2', cap: 'type', target: 'Fitness' },
      { id: 's3', goalId: 'g3', cap: 'type', target: 'FAIL' },
    ]);
    const planB = buildPlan([
      { id: 't3', goalId: 'g3b', cap: 'type', target: 'Fitness-Result' },
      { id: 't1', goalId: 'g1', cap: 'launchApp', target: 'Settings' },
      { id: 't2', goalId: 'g2', cap: 'type', target: 'Fitness' },
    ]);

    const { fn, backendsUsed } = makeReasonForRun(planA, planB);

    sessionMock.setExecuteMock((action: { type: string; text?: string }) =>
      action.type === 'type' && action.text === 'FAIL'
        ? Promise.resolve({ success: false, duration: 100, error: 'injected failure' })
        : Promise.resolve({ success: true, duration: 100, verified: true })
    );

    const outcome = await runOnDevice(
      { prompt: 'Open Settings, search Fitness', backend: 'apple' },
      fn
    );

    expect(outcome.success).toBe(true);
    if (outcome.kind !== 'executed') throw new Error(`got ${outcome.kind}`);
    expect(outcome.attempts).toBe(2);
    expect(backendsUsed).toEqual(['apple', 'apple']);

    const keys = outcome.executed.map(executedKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(outcome.executed.filter((e) => /^launch /i.test(e.description)).length).toBe(1);
    expect(outcome.executed.filter((e) => /^type:?\s+Fitness$/i.test(e.description)).length).toBe(
      1
    );
  });

  it('handles different plan lengths between attempts', async () => {
    const planA = buildPlan([
      { id: 's1', goalId: 'g1', cap: 'launchApp', target: 'Settings' },
      { id: 's2', goalId: 'g2', cap: 'type', target: 'Fitness' },
      { id: 's3', goalId: 'g3', cap: 'type', target: 'FAIL' },
    ]);
    const planB = buildPlan([{ id: 't3', goalId: 'g3b', cap: 'type', target: 'Fitness-Result' }]);

    const { fn, planStepCounts } = makeReasonForRun(planA, planB);

    sessionMock.setExecuteMock((action: { type: string; text?: string }) =>
      action.type === 'type' && action.text === 'FAIL'
        ? Promise.resolve({ success: false, duration: 100, error: 'injected failure' })
        : Promise.resolve({ success: true, duration: 100, verified: true })
    );

    const outcome = await runOnDevice({ prompt: 'Search Fitness', backend: 'apple' }, fn);

    expect(outcome.success).toBe(true);
    if (outcome.kind !== 'executed') throw new Error(`got ${outcome.kind}`);
    expect(outcome.attempts).toBe(2);
    expect(planStepCounts[0]).not.toBe(planStepCounts[1]);

    const keys = outcome.executed.map(executedKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('recovers from a middle-step failure without replaying completed work', async () => {
    const planA = buildPlan([
      { id: 's1', goalId: 'g1', cap: 'launchApp', target: 'Settings' },
      { id: 's2', goalId: 'g2', cap: 'type', target: 'A' },
      { id: 's3', goalId: 'g3', cap: 'type', target: 'FAIL' },
      { id: 's4', goalId: 'g4', cap: 'type', target: 'C' },
    ]);
    const planB = buildPlan([
      { id: 't2', goalId: 'g2', cap: 'type', target: 'A' },
      { id: 't3', goalId: 'g3b', cap: 'type', target: 'Fitness-Result' },
      { id: 't4', goalId: 'g4', cap: 'type', target: 'C' },
      { id: 't1', goalId: 'g1', cap: 'launchApp', target: 'Settings' },
    ]);

    const { fn } = makeReasonForRun(planA, planB);

    sessionMock.setExecuteMock((action: { type: string; text?: string }) =>
      action.type === 'type' && action.text === 'FAIL'
        ? Promise.resolve({ success: false, duration: 100, error: 'injected failure' })
        : Promise.resolve({ success: true, duration: 100, verified: true })
    );

    const outcome = await runOnDevice({ prompt: 'Multi step', backend: 'apple' }, fn);

    expect(outcome.success).toBe(true);
    if (outcome.kind !== 'executed') throw new Error(`got ${outcome.kind}`);
    expect(outcome.attempts).toBe(2);

    const keys = outcome.executed.map(executedKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(outcome.executed.filter((e) => /^launch /i.test(e.description)).length).toBe(1);
    expect(outcome.executed.filter((e) => /^type:?\s+A$/i.test(e.description)).length).toBe(1);
  });

  it('triggers recovery when final verification fails, preserving the apple backend', async () => {
    let verifyFailureLeft = 1;
    sessionMock.setExecuteMock((action: { type: string }) => {
      if (action.type === 'getTree' && verifyFailureLeft > 0) {
        verifyFailureLeft -= 1;
        return Promise.resolve({ success: false, duration: 100, error: 'verification failed' });
      }
      return Promise.resolve({ success: true, duration: 100, verified: true });
    });

    const planA = buildPlan([
      { id: 's1', goalId: 'g1', cap: 'launchApp', target: 'Settings' },
      { id: 's2', goalId: 'g2', cap: 'type', target: 'Fitness' },
    ]);

    const { fn, backendsUsed } = makeReasonForRun(planA, planA);

    const outcome = await runOnDevice({ prompt: 'Open Settings', backend: 'apple' }, fn);

    expect(outcome.success).toBe(true);
    if (outcome.kind !== 'executed') throw new Error(`got ${outcome.kind}`);
    expect(outcome.attempts).toBe(2);
    expect(backendsUsed).toEqual(['apple', 'apple']);
    expect(outcome.backendId).toBe('apple:system-language-model');
  });
});
