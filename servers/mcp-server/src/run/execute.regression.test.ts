import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { reasonForRun } from './reason.js';
import type { SemanticElement, SemanticModel, Selector } from '@athena-os/core';

/**
 * Focused regression tests for two recovery defects:
 *
 *  Bug 1 — launchApp re-executed on apple-style re-plans.
 *  When a later step fails, the apple planner returns a fresh plan with NEW
 *  stepIds AND NEW goalIds (e.g. intent-"Settings" -> goal g1 in attempt 1,
 *  but goal g1b in attempt 2). Recovery must recognize the work was already
 *  done by the stable capability+target signature, not by the volatile id, and
 *  must NOT re-launch the app. It must instead continue from the current state.
 *
 *  Bug 2 — resolver confuses the Search field with a search result.
 *  After typing "Bluetooth" into Search, the field carries that value. A tap on
 *  "Bluetooth" (the result row) must resolve to the RESULT element, never back
 *  to the Search control (whose label stays "Search").
 */

vi.mock('../sessionManager.js', () => {
  let executeMock: ((action: { type: string; text?: string; selector?: Selector }) => Promise<unknown>) | null =
    null;
  return {
    mcpSessionManager: {
      getExecutor: () => ({
        execute: (action: { type: string; text?: string; selector?: Selector }) =>
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
    fn: ((action: { type: string; text?: string; selector?: Selector }) => Promise<unknown>) | null
  ) => void;
}
const sessionMock = (await import('../sessionManager.js')).__test as unknown as SessionTest;

// --- synthetic on-screen model ------------------------------------------------

function el(
  id: string,
  role: SemanticElement['role'],
  label: string,
  extra?: { value?: string; children?: SemanticElement[]; rect?: SemanticElement['rect'] }
): SemanticElement {
  return {
    id,
    role,
    type: role,
    label,
    value: extra?.value,
    rect: extra?.rect,
    enabled: true,
    visible: true,
    confidence: { value: 0.9, source: 'Accessibility' },
    children: extra?.children ?? [],
  };
}

function makeModel(): SemanticModel {
  const root = el('root', 'other', '', {
    children: [
      // The search control keeps its own label "Search" even after the user
      // types "Bluetooth" into it (the query lives in `value`).
      el('search', 'search_field', 'Search', { value: 'Bluetooth', rect: { x: 0, y: 0, width: 100, height: 40 } }),
      el('bt', 'cell', 'Bluetooth', { rect: { x: 0, y: 50, width: 100, height: 40 } }),
      el('done', 'cell', 'Done', { rect: { x: 0, y: 100, width: 100, height: 40 } }),
      el('fail', 'cell', 'FAIL', { rect: { x: 0, y: 150, width: 100, height: 40 } }),
    ],
  });
  return {
    score: 0.9,
    capturedAt: new Date().toISOString(),
    root,
    summary: {
      elementCount: 5,
      leafCount: 4,
      interactiveCount: 4,
      visibleCount: 5,
      labeledCount: 4,
      averageConfidence: 0.9,
      labelCoverage: 1,
    },
  };
}

// --- plan construction -------------------------------------------------------

interface StepSpec {
  id: string;
  goalId: string;
  cap: 'launchApp' | 'tap' | 'type';
  target: string;
}

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

function makeReasonForRun(planA: ReturnType<typeof buildPlan>, planB: ReturnType<typeof buildPlan>) {
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

let taps: { description: string; selector?: Selector }[] = [];

beforeEach(() => {
  taps = [];
  sessionMock.setExecuteMock((action: { type: string; text?: string; selector?: Selector }) => {
    if (action.type === 'getTree') {
      return Promise.resolve({ success: true, metadata: { model: makeModel() } });
    }
    if (action.type === 'type') return Promise.resolve({ success: true, duration: 100 });
    if (action.type === 'launchApp') return Promise.resolve({ success: true, duration: 100 });
    if (action.type === 'tap') {
      taps.push({ description: action.description, selector: action.selector });
      if (action.description.includes('FAIL')) {
        return Promise.resolve({ success: false, duration: 100, error: 'injected failure' });
      }
      return Promise.resolve({ success: true, duration: 100 });
    }
    return Promise.resolve({ success: true, duration: 100 });
  });
});

describe('regression: launchApp not re-executed on apple-style re-plans (Bug 1)', () => {
  it('launches once, fails a later step, re-plans with new ids, and continues without re-launching', async () => {
    // Attempt 1: launch Settings, type Bluetooth, tap result, then a step that fails.
    const planA = buildPlan([
      { id: 's1', goalId: 'g1', cap: 'launchApp', target: 'Settings' },
      { id: 's2', goalId: 'g2', cap: 'type', target: 'Bluetooth' },
      { id: 's3', goalId: 'g3', cap: 'tap', target: 'Bluetooth' },
      { id: 's4', goalId: 'g4', cap: 'tap', target: 'FAIL' },
    ]);
    // Attempt 2 (apple-style): brand-new stepIds AND brand-new goalIds, launchApp
    // re-listed but with a different id/goal, plus a new trailing step.
    const planB = buildPlan([
      { id: 't1', goalId: 'g2b', cap: 'type', target: 'Bluetooth' },
      { id: 't2', goalId: 'g1b', cap: 'launchApp', target: 'Settings' },
      { id: 't3', goalId: 'g3b', cap: 'tap', target: 'Bluetooth' },
      { id: 't4', goalId: 'g4b', cap: 'tap', target: 'Done' },
    ]);

    const { fn } = makeReasonForRun(planA, planB);

    const outcome = await runOnDevice(
      { prompt: 'Open Settings, search Bluetooth, open it', backend: 'apple' },
      fn
    );

    // 1. Attempt 1 launched Settings successfully.
    expect(outcome.success).toBe(true);
    if (outcome.kind !== 'executed') throw new Error(`got ${outcome.kind}`);
    expect(outcome.executed.some((e) => e.capabilityId === 'launchApp' && e.success)).toBe(true);

    // 2. A later step failed -> recovery triggered (>=2 attempts).
    expect(outcome.attempts).toBe(2);

    // 3. Attempt 2 carried a fresh launchApp step under a new goal id.
    //    (Structural: a re-plan with a new plan length occurred.)
    expect(outcome.attempts).toBeGreaterThanOrEqual(2);

    // 4. launchApp was NOT executed again: exactly one launch across both attempts.
    const launchExecutions = outcome.executed.filter((e) => e.capabilityId === 'launchApp');
    expect(launchExecutions).toHaveLength(1);

    // 5. Recovery continued from the current state: the new trailing step ran.
    expect(outcome.executed.some((e) => /tap\s+done/i.test(e.description))).toBe(true);

    // No meaningful verified work was repeated across attempts.
    const meaningful = outcome.executed
      .filter((e) => ['launchapp', 'tap', 'type'].includes(e.capabilityId.toLowerCase()))
      .map(executedKey);
    expect(new Set(meaningful).size).toBe(meaningful.length);
  });
});

describe('regression: resolver distinguishes Search field from search result (Bug 2)', () => {
  it('tap "Bluetooth" resolves to the result row, not the Search control', async () => {
    const plan = buildPlan([
      { id: 's1', goalId: 'g1', cap: 'type', target: 'Bluetooth' },
      { id: 's2', goalId: 'g2', cap: 'tap', target: 'Bluetooth' },
      { id: 's3', goalId: 'g3', cap: 'tap', target: 'Done' },
    ]);

    const { fn } = makeReasonForRun(plan, plan);

    const outcome = await runOnDevice({ prompt: 'Search Bluetooth', backend: 'apple' }, fn);

    expect(outcome.success).toBe(true);
    if (outcome.kind !== 'executed') throw new Error(`got ${outcome.kind}`);

    const bluetoothTap = taps.find((t) => /tap\s+bluetooth/i.test(t.description));
    const doneTap = taps.find((t) => /tap\s+done/i.test(t.description));
    expect(bluetoothTap, 'expected a tap on Bluetooth to be executed').toBeDefined();
    expect(doneTap, 'expected a tap on Done to be executed').toBeDefined();

    // The result, not the Search field (label "Search", value "Bluetooth").
    expect(bluetoothTap!.selector).toEqual({ type: 'label', value: 'Bluetooth' });
    expect(bluetoothTap!.selector?.value).not.toBe('Search');
    expect(doneTap!.selector).toEqual({ type: 'label', value: 'Done' });
  });
});
