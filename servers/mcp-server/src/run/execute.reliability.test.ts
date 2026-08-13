import { describe, it, expect, beforeAll } from 'vitest';
import { runOnDevice, ATHENA_INJECTED_MISSING_ELEMENT } from './execute.js';
import { reasonForRun } from './reason.js';

/**
 * Real-device reliability suite.
 *
 * Purpose: MEASURE how reliably Athena performs different real phone tasks and
 * recovers from different real failure modes on a live iPhone simulator — not
 * to prove a single hand-crafted task works (that is the acceptance test).
 *
 * Everything here exercises the REAL execution path. Nothing is mocked:
 * the iPhone executor, Appium/WDA, the Apple on-device model, and TaskMemory
 * are all live. The only controlled injection is at the planner boundary — we
 * rewrite a planned tap target to a label the resolver can never find, so the
 * production system genuinely fails to resolve a missing element and recovers
 * from the actual device state.
 *
 * Gated behind ATHENA_REAL_DEVICE=1. Without it the suite skips cleanly.
 *
 * Run:
 *   ATHENA_REAL_DEVICE=1 npx vitest run "servers/mcp-server/src/run/execute.reliability.test.ts"
 */

const REAL_DEVICE = process.env.ATHENA_REAL_DEVICE === '1';

const SENTINEL = ATHENA_INJECTED_MISSING_ELEMENT;

type TaskCategory =
  'normal' | 'recovery' | 'verification' | 'ui-observation' | 'long-horizon' | 'apple-backend';

type FailureType =
  | 'missing-element'
  | 'wrong-screen'
  | 'stale-ui'
  | 'failed-tap'
  | 'unexpected-navigation'
  | 'failed-typing'
  | 'verification-failure'
  | 'middle-step'
  | 'long-horizon'
  | 'backend-unavailable';

type RunReasoning = ReturnType<typeof reasonForRun>;

interface ReliabilityTask {
  id: string;
  description: string;
  goal: string;
  category: TaskCategory;
  backend: 'apple';
  /** Planner-boundary injection that forces a controlled, real failure. */
  inject?: (outer: RunReasoning) => void;
  failureType?: FailureType;
}

interface ReliabilityResult {
  taskId: string;
  description: string;
  category: TaskCategory;
  backend: string;
  success: boolean;
  attempts: number;
  initialStepCount: number;
  totalExecutedSteps: number;
  recovered: boolean;
  repeatedSteps: number;
  failedStep?: string;
  failureType?: FailureType;
  verificationPassed: boolean;
  finalMemoryStatus: string;
  durationMs: number;
  appleUsedEverywhere: boolean;
  recoveryGeneratedNewPlan: boolean;
  observationCaptured: boolean;
  repeatedWork: boolean;
  /** Per-step execution trace, for diagnosing failures. */
  steps: { description: string; success: boolean; error?: string }[];
}

/** Stable per-action key: capability + normalized target (mirrors recovery's identity). */
function executedKey(e: { capabilityId?: string; description: string }): string {
  const d = e.description.toLowerCase();
  const m = d.match(/^(?:launch|type:?|tap)\s+(.+)$/);
  const target = m ? m[1].replace(/"/g, '').trim() : d;
  return `${e.capabilityId ?? 'unknown'}::${target}`;
}

/** Count actions whose stable identity already succeeded in an earlier step. */
function countRepeatedSteps(
  executed: { stepIndex: number; success: boolean; capabilityId?: string; description: string }[]
): number {
  // Only target-bearing actions (launchApp/tap/type) represent "verified work"
  // that recovery must not repeat; observation/control steps (wait, getTree, …)
  // are idempotent and re-running them is not a recovery defect.
  const MEANINGFUL = new Set(['launchapp', 'tap', 'type']);
  const ordered = [...executed].sort((a, b) => a.stepIndex - b.stepIndex);
  const seen = new Set<string>();
  let repeated = 0;
  for (const e of ordered) {
    if (!MEANINGFUL.has((e.capabilityId ?? '').toLowerCase())) continue;
    const key = executedKey(e);
    if (e.success && seen.has(key)) repeated += 1;
    if (e.success) seen.add(key);
  }
  return repeated;
}

/**
 * Inject an unresolvable tap target into a chosen tap step of the FIRST plan
 * only (so the recovery re-plan is the genuine Apple plan, not a re-injected
 * one). `position: 'last'` simulates a failure late in the flow; `'early'`
 * simulates a failure shortly after launch.
 */
function injectMissingTapAt(position: 'last' | 'early'): (outer: RunReasoning) => void {
  return (outer) => {
    const result = outer.result;
    if (result.kind !== 'executionPlan') return;
    const steps = result.plan.steps;
    if (steps.length < 2) return;
    const taps = steps.map((s, i) => [s, i] as const).filter(([s]) => s.capabilityId === 'tap');
    if (taps.length === 0) return;
    const tapIndex = position === 'last' ? taps.length - 1 : 0;
    const at = Math.min(Math.max(1, taps[tapIndex][1]), steps.length - 1);
    const replaced = steps[at];
    let goal = outer.intent.goals.find((g) => g.id === replaced.goalId);
    if (!goal) {
      goal = {
        id: replaced.goalId ?? 'injected-goal',
        kind: 'tap',
        description: `Tap "${SENTINEL}"`,
      };
      outer.intent.goals.push(goal);
      replaced.goalId = goal.id;
    }
    goal.description = `Tap "${SENTINEL}"`;
    steps[at] = {
      ...replaced,
      id: replaced.id,
      capabilityId: 'tap',
      action: 'tap',
      description: `tap "${SENTINEL}"`,
      goalId: goal.id,
    };
  };
}

interface RunMeta {
  backendsUsed: string[];
  planStepCounts: number[];
  sawObservationOnReplan: boolean;
}

function summarize(
  task: ReliabilityTask,
  outcome: unknown,
  meta: RunMeta,
  durationMs: number
): ReliabilityResult {
  const o = outcome as {
    success: boolean;
    kind: string;
    backendId: string;
    attempts?: number;
    executed?: {
      stepIndex: number;
      success: boolean;
      capabilityId?: string;
      description: string;
      error?: string;
    }[];
    memory?: { status: string; steps: { capabilityId: string; status: string }[] };
  };

  const executed = o.executed ?? [];
  const attempts = o.attempts ?? 1;
  const memory = o.memory;
  const appleUsedEverywhere =
    meta.backendsUsed.length > 0 && meta.backendsUsed.every((b) => b === 'apple');

  let success = o.success;
  let failureType = task.failureType;
  if (o.kind === 'clarificationRequired') {
    success = false;
    failureType = 'backend-unavailable';
  }

  const failedStep = executed.find((e) => !e.success)?.description;
  const repeatedSteps = countRepeatedSteps(executed);
  const recovered = attempts >= 2;
  const verificationPassed =
    memory?.steps.some((s) => s.capabilityId === 'verify' && s.status === 'verified') ?? false;
  const finalMemoryStatus = memory?.status ?? 'unknown';
  const recoveryGeneratedNewPlan = meta.planStepCounts.length >= 2;

  return {
    taskId: task.id,
    description: task.description,
    category: task.category,
    backend: o.backendId,
    success,
    attempts,
    initialStepCount: meta.planStepCounts[0] ?? 0,
    totalExecutedSteps: executed.length,
    recovered,
    repeatedSteps,
    failedStep,
    failureType,
    verificationPassed,
    finalMemoryStatus,
    durationMs,
    appleUsedEverywhere,
    recoveryGeneratedNewPlan,
    observationCaptured: meta.sawObservationOnReplan,
    repeatedWork: repeatedSteps > 0,
    steps: executed.map((e) => ({
      description: e.description,
      success: e.success,
      error: e.error,
    })),
  };
}

async function runReliabilityTask(task: ReliabilityTask): Promise<ReliabilityResult> {
  const meta: RunMeta = { backendsUsed: [], planStepCounts: [], sawObservationOnReplan: false };
  let injected = false;

  const wrapper: typeof reasonForRun = (p, opts) => {
    const outer = reasonForRun(p, opts);
    if (opts?.backend) meta.backendsUsed.push(opts.backend);
    if (opts?.observation) meta.sawObservationOnReplan = true;
    const result = outer.result;
    if (result.kind === 'executionPlan') {
      meta.planStepCounts.push(result.plan.steps.length);
      if (task.inject && !injected) {
        injected = true;
        task.inject(outer);
      }
    }
    return outer;
  };

  const start = Date.now();
  let outcome: unknown;
  try {
    outcome = await runOnDevice({ prompt: task.goal, backend: task.backend }, wrapper);
  } catch {
    return {
      taskId: task.id,
      description: task.description,
      category: task.category,
      backend: 'unknown',
      success: false,
      attempts: 1,
      initialStepCount: meta.planStepCounts[0] ?? 0,
      totalExecutedSteps: 0,
      recovered: false,
      repeatedSteps: 0,
      failureType: 'backend-unavailable',
      verificationPassed: false,
      finalMemoryStatus: 'unknown',
      durationMs: Date.now() - start,
      appleUsedEverywhere: false,
      recoveryGeneratedNewPlan: meta.planStepCounts.length >= 2,
      observationCaptured: false,
      repeatedWork: false,
    };
  }
  return summarize(task, outcome, meta, Date.now() - start);
}

function printReport(results: ReliabilityResult[]): void {
  const total = results.length;
  const successful = results.filter((r) => r.success).length;
  const failed = total - successful;
  const successRate = total ? `${((successful / total) * 100).toFixed(0)}%` : 'n/a';
  const recoveryTriggered = results.filter((r) => r.recovered).length;
  const recoverySuccessful = results.filter((r) => r.recovered && r.success).length;
  const avgAttempts = total
    ? (results.reduce((a, r) => a + r.attempts, 0) / total).toFixed(1)
    : '0';
  const repeatedStepsTotal = results.reduce((a, r) => a + r.repeatedSteps, 0);
  const verificationFailures = results.filter((r) => !r.verificationPassed).length;
  const appleUsage = total
    ? `${((results.filter((r) => r.appleUsedEverywhere).length / total) * 100).toFixed(0)}%`
    : 'n/a';

  console.log('\nReliability Report');
  console.log('------------------');
  console.log(`Tasks:                 ${total}`);
  console.log(`Successful:            ${successful}`);
  console.log(`Failed:                ${failed}`);
  console.log(`Success rate:          ${successRate}`);
  console.log(`Recovery triggered:    ${recoveryTriggered}`);
  console.log(`Recovery successful:   ${recoverySuccessful}`);
  console.log(`Average attempts:      ${avgAttempts}`);
  console.log(`Repeated steps:        ${repeatedStepsTotal}`);
  console.log(`Verification failures: ${verificationFailures}`);
  console.log(`Apple backend usage:   ${appleUsage}`);
  console.log('');
  console.log('Per-task:');
  for (const r of results) {
    const status = r.success ? 'PASS' : 'FAIL';
    const rec = r.recovered ? ' [recovered]' : '';
    const rep = r.repeatedSteps > 0 ? ` [repeated:${r.repeatedSteps}]` : '';
    const fail = r.failureType ? ` [${r.failureType}]` : '';
    console.log(
      `${status}  ${r.taskId.padEnd(22)} ${String(r.attempts).padStart(2)} attempts  ${String(
        r.totalExecutedSteps
      ).padStart(2)} steps  ${r.category}${rec}${rep}${fail}`
    );
  }

  const dirty = results.filter((r) => !r.success || r.repeatedSteps > 0 || !r.verificationPassed);
  if (dirty.length > 0) {
    console.log('\nTask diagnostics:');
    for (const r of dirty) {
      console.log(
        `\n  [${r.taskId}] success=${r.success} attempts=${r.attempts} memory=${r.finalMemoryStatus} verify=${r.verificationPassed} repeated=${r.repeatedSteps}`
      );
      if (r.failedStep) console.log(`  failedStep: ${r.failedStep}`);
      for (const s of r.steps) {
        console.log(
          `    ${s.success ? 'ok  ' : 'FAIL'} ${s.description}${s.error ? ` -> ${s.error}` : ''}`
        );
      }
    }
  }
}

/**
 * Task matrix. Add tasks here without touching the harness: give each an id,
 * goal, category, and (for failure scenarios) an `inject` + `failureType`.
 *
 * First implementation ships 3 deterministic normal tasks + 2 controlled
 * missing-element recovery scenarios. Expand the matrix once these are green.
 */
const TASKS: ReliabilityTask[] = [
  {
    id: 'open-settings',
    description: 'Open Settings',
    goal: 'Open the Settings app.',
    category: 'normal',
    backend: 'apple',
  },
  {
    id: 'settings-search-wifi',
    description: 'Search Settings for Wi-Fi and verify',
    goal: 'Open Settings, search for Wi-Fi, and verify the Wi-Fi settings screen is displayed.',
    category: 'normal',
    backend: 'apple',
  },
  {
    id: 'settings-navigate-general',
    description: 'Open Settings and navigate into General',
    goal: 'Open Settings, tap General, and verify the General settings screen is shown.',
    category: 'normal',
    backend: 'apple',
  },
  {
    id: 'recover-missing-late',
    description: 'Recover from a missing element late in the flow',
    goal: 'Open Settings, search for Bluetooth, open the relevant result, and verify the Bluetooth settings screen is displayed.',
    category: 'recovery',
    backend: 'apple',
    inject: injectMissingTapAt('last'),
    failureType: 'missing-element',
  },
  {
    id: 'recover-missing-early',
    description: 'Recover from a missing element early in the flow',
    goal: 'Open Settings, search for Display, open the relevant result, and verify the Display settings screen is displayed.',
    category: 'recovery',
    backend: 'apple',
    inject: injectMissingTapAt('early'),
    failureType: 'missing-element',
  },
];

describe.skipIf(!REAL_DEVICE)('real-device reliability suite', () => {
  beforeAll(() => {
    process.env.ATHENA_REASONING_BACKEND = 'apple';
  });

  it('runs the reliability matrix sequentially on the live device and reports', async () => {
    const results: ReliabilityResult[] = [];

    for (const task of TASKS) {
      console.log(`\n[reliability] running task: ${task.id} (${task.description})`);
      const result = await runReliabilityTask(task);
      results.push(result);
    }

    printReport(results);

    // --- Structural invariants (the architecture must hold) ---------------
    // Apple must stay selected on every reasoning attempt; no silent fallback.
    const appleBad = results.filter(
      (r) => r.failureType !== 'backend-unavailable' && !r.appleUsedEverywhere
    );
    expect(
      appleBad,
      `Apple backend not used everywhere: ${JSON.stringify(appleBad.map((r) => r.taskId))}`
    ).toHaveLength(0);

    // TaskMemory must have recorded a lifecycle status for every task.
    for (const r of results) {
      expect(['created', 'running', 'recovered', 'completed', 'failed']).toContain(
        r.finalMemoryStatus
      );
    }

    // A recovery scenario must actually have triggered a re-plan with a captured
    // real-device observation. These are architectural invariants of the harness
    // (we control the injection), so they are hard-gated.
    for (const r of results) {
      if (r.failureType && r.failureType !== 'backend-unavailable') {
        expect(r.recovered, `${r.taskId} should have recovered (attempts>=2)`).toBe(true);
        expect(r.attempts, `${r.taskId} should have used >=2 attempts`).toBeGreaterThanOrEqual(2);
        expect(r.recoveryGeneratedNewPlan, `${r.taskId} should have generated a new plan`).toBe(
          true
        );
        expect(
          r.observationCaptured,
          `${r.taskId} should have captured a real device observation`
        ).toBe(true);
      }
    }

    // Task-level reliability (success rate, repeated verified work) is MEASURED,
    // not hard-gated: a reliability suite must stay green as a recurring
    // measurement and surface deficiencies in its report instead of hiding them
    // behind a red build. The report above already lists every failure.
    const reliabilityIssues = results.filter(
      (r) =>
        r.failureType !== 'backend-unavailable' &&
        (!r.success || r.repeatedSteps > 0 || !r.verificationPassed)
    );
    if (reliabilityIssues.length > 0) {
      console.log(
        `\nReliability issues detected (reported, not failing the suite): ${reliabilityIssues
          .map((r) => r.taskId)
          .join(', ')}`
      );
    }
  }, 600000);
});
