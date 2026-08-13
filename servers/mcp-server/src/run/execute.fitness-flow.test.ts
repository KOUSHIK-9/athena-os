import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { reasonForRun } from './reason.js';
import type { SemanticElement, SemanticModel, Selector } from '@athena-os/core';

/**
 * Regression coverage for the multi-step simulator flow:
 *
 *   Open Settings -> Open Search -> Type "Fitness" -> Tap the result -> Verify
 *
 * The flow must complete reliably from MULTIPLE starting UI states. In
 * particular, if the target app is already the foreground app (e.g. the task
 * was issued from inside Settings, or a recovery re-plan begins mid-flow), the
 * launch must NOT be re-executed — the executor's state-aware skip handles it
 * and the rest of the flow proceeds unchanged.
 *
 * No real device/simulator is required: the iPhone executor is mocked with a
 * synthetic accessibility tree, consistent with the other recovery/regression
 * suites.
 */

vi.mock('../sessionManager.js', () => {
  let executeMock:
    | ((action: { type: string; text?: string; selector?: Selector }) => Promise<unknown>)
    | null = null;
  let activeApp: { bundleId: string; name: string } = {
    bundleId: 'com.apple.SpringBoard',
    name: 'Home',
  };
  let launchCalls = 0;
  return {
    mcpSessionManager: {
      getExecutor: () => ({
        execute: (action: { type: string; text?: string; selector?: Selector }) => {
          if (action.type === 'launchApp') launchCalls += 1;
          return executeMock ? executeMock(action) : Promise.resolve({ success: true, duration: 100 });
        },
        getSession: () => ({ id: 'test-session', deviceUdid: 'test-udid' }),
        getActiveApp: () => Promise.resolve(activeApp),
      }),
      connect: () => Promise.resolve({ sessionId: 'test-session', deviceUdid: 'test-udid' }),
      getActiveSessions: () => [],
    },
    __test: {
      setExecuteMock: (fn: typeof executeMock) => {
        executeMock = fn;
      },
      setActiveApp: (app: { bundleId: string; name: string }) => {
        activeApp = app;
      },
      getLaunchCalls: () => launchCalls,
      resetLaunchCalls: () => {
        launchCalls = 0;
      },
    },
  };
});

interface SessionTest {
  setExecuteMock: (
    fn:
      | ((action: { type: string; text?: string; selector?: Selector }) => Promise<unknown>)
      | null
  ) => void;
  setActiveApp: (app: { bundleId: string; name: string }) => void;
  getLaunchCalls: () => number;
  resetLaunchCalls: () => void;
}
const sessionMock = (await import('../sessionManager.js')).__test as unknown as SessionTest;

const SETTINGS_BUNDLE = 'com.apple.Preferences';

// --- synthetic on-screen model: Settings with a focused search + Fitness result
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

function makeSettingsTree(): SemanticModel {
  const root = el('root', 'other', '', {
    children: [
      // The search control keeps its own label "Search" even after the user
      // types "Fitness" into it (the query lives in `value`).
      el('search', 'search_field', 'Search', {
        value: 'Fitness',
        rect: { x: 0, y: 0, width: 100, height: 40 },
      }),
      el('fitness', 'cell', 'Fitness', { rect: { x: 0, y: 50, width: 100, height: 40 } }),
      el('done', 'cell', 'Done', { rect: { x: 0, y: 100, width: 100, height: 40 } }),
    ],
  });
  return {
    score: 0.9,
    capturedAt: new Date().toISOString(),
    root,
    summary: {
      elementCount: 4,
      leafCount: 3,
      interactiveCount: 3,
      visibleCount: 4,
      labeledCount: 3,
      averageConfidence: 0.9,
      labelCoverage: 1,
    },
  };
}

// --- plan construction: Open Settings -> Search -> Type Fitness -> Tap result
interface StepSpec {
  id: string;
  goalId: string;
  cap: 'launchApp' | 'tap' | 'type';
  target: string;
}

function buildFitnessPlan(specs: StepSpec[]) {
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

function makeReasonForRun(plan: ReturnType<typeof buildFitnessPlan>) {
  const fn = ((p: string, _opts: { backend?: string; observation?: unknown }) => ({
    intent: plan.intent,
    backendId: 'apple:system-language-model',
    originalPrompt: p,
    result: {
      kind: 'executionPlan' as const,
      plan: plan.plan,
      goals: plan.intent.goals,
      simulation: {},
      executionGraph: {},
    },
  })) as unknown as typeof reasonForRun;
  return { fn };
}

const { runOnDevice } = await import('./execute.js');

let taps: { description: string; selector?: Selector }[] = [];

beforeEach(() => {
  taps = [];
  sessionMock.resetLaunchCalls();
  sessionMock.setActiveApp({ bundleId: 'com.apple.SpringBoard', name: 'Home' });
  sessionMock.setExecuteMock((action: { type: string; text?: string; selector?: Selector }) => {
    if (action.type === 'getTree') {
      return Promise.resolve({ success: true, metadata: { model: makeSettingsTree() } });
    }
    if (action.type === 'type') return Promise.resolve({ success: true, duration: 100 });
    if (action.type === 'launchApp') return Promise.resolve({ success: true, duration: 100 });
    if (action.type === 'tap') {
      taps.push({ description: action.description, selector: action.selector });
      return Promise.resolve({ success: true, duration: 100 });
    }
    return Promise.resolve({ success: true, duration: 100 });
  });
});

describe('multi-step simulator flow: Open Settings -> search Fitness -> verify', () => {
  const plan = buildFitnessPlan([
    { id: 's1', goalId: 'g1', cap: 'launchApp', target: 'Settings' },
    { id: 's2', goalId: 'g2', cap: 'tap', target: 'Search' },
    { id: 's3', goalId: 'g3', cap: 'type', target: 'Fitness' },
    { id: 's4', goalId: 'g4', cap: 'tap', target: 'Fitness' },
  ]);

  it('completes from the Home screen (app must be launched)', async () => {
    sessionMock.setActiveApp({ bundleId: 'com.apple.SpringBoard', name: 'Home' });
    const { fn } = makeReasonForRun(plan);

    const outcome = await runOnDevice(
      { prompt: 'Open Settings, search Fitness', backend: 'apple' },
      fn
    );

    expect(outcome.success).toBe(true);
    if (outcome.kind !== 'executed') throw new Error(`got ${outcome.kind}`);
    expect(outcome.attempts).toBe(1);

    // App was launched exactly once from Home (the device received one launch).
    expect(sessionMock.getLaunchCalls()).toBe(1);
    expect(outcome.executed.filter((e) => e.capabilityId === 'launchApp')).toHaveLength(1);
    // The search field and the result were both tapped, resolving by label.
    const searchTap = taps.find((t) => /tap\s+search/i.test(t.description));
    const resultTap = taps.find((t) => /tap\s+fitness/i.test(t.description));
    expect(searchTap?.selector).toEqual({ type: 'label', value: 'Search' });
    expect(resultTap?.selector).toEqual({ type: 'label', value: 'Fitness' });
    // Final state was verified and TaskMemory reports completed.
    expect(outcome.memory?.status).toBe('completed');
    expect(
      outcome.memory?.steps.some((s) => s.capabilityId === 'verify' && s.status === 'verified')
    ).toBe(true);
  });

  it('completes from inside Settings without re-launching the app', async () => {
    // Starting state: Settings is already the foreground app.
    sessionMock.setActiveApp({ bundleId: SETTINGS_BUNDLE, name: 'Settings' });
    const { fn } = makeReasonForRun(plan);

    const outcome = await runOnDevice({ prompt: 'Search Fitness', backend: 'apple' }, fn);

    expect(outcome.success).toBe(true);
    if (outcome.kind !== 'executed') throw new Error(`got ${outcome.kind}`);

    // Launch is skipped because the app is already foreground: the device is
    // never told to re-launch, yet the flow still reaches the result + verify.
    expect(sessionMock.getLaunchCalls()).toBe(0);
    const searchTap = taps.find((t) => /tap\s+search/i.test(t.description));
    const resultTap = taps.find((t) => /tap\s+fitness/i.test(t.description));
    expect(searchTap).toBeDefined();
    expect(resultTap).toBeDefined();
    expect(outcome.memory?.status).toBe('completed');
  });
});
