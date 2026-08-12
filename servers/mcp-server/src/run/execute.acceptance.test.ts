import { describe, it, expect, beforeAll } from 'vitest';
import { runOnDevice, ATHENA_INJECTED_MISSING_ELEMENT } from './execute.js';
import { reasonForRun } from './reason.js';

/**
 * Real-device acceptance checkpoint.
 *
 * This is the proof that Athena can drive a REAL iPhone simulator (no mocked
 * executor) through a 5-10 step task, hit a middle-step failure, observe the
 * actual device UI, re-plan, recover WITHOUT repeating successful steps, and
 * record the whole run in TaskMemory with the Apple backend still selected.
 *
 * It is intentionally skipped unless the environment opts in, so CI and sandbox
 * runs stay green. To run it for real:
 *
 *   1. Boot an iOS simulator and have WebDriverAgent reachable
 *      (APPIUM_WDA_URL / device udid as your setup expects).
 *   2. Ensure the Apple reasoning backend is available (ATHENA_REASONING_BACKEND=apple).
 *   3. ATHENA_REAL_DEVICE=1 pnpm --filter @athena-os/mcp-server test \
 *        src/run/execute.acceptance.test.ts
 *
 * Only the planner is wrapped: we deterministically inject a missing-element
 * failure into a specific executable action (never the first step, so at least
 * one genuinely successful action precedes it). The real executor genuinely
 * fails to resolve the missing label, so recovery happens from the actual
 * device state.
 */

const REAL_DEVICE = process.env.ATHENA_REAL_DEVICE === '1';

/** Stable per-action key: capability + normalized target (mirrors recovery's identity). */
function executedKey(e: { capabilityId: string; description: string }): string {
  const d = e.description.toLowerCase();
  const m = d.match(/^(?:launch|type:?|tap)\s+(.+)$/);
  const target = m ? m[1].replace(/"/g, '').trim() : d;
  return `${e.capabilityId}::${target}`;
}

describe.skipIf(!REAL_DEVICE)('real-device acceptance: Settings -> Fitness', () => {
  beforeAll(() => {
    process.env.ATHENA_REASONING_BACKEND = 'apple';
  });

  it('completes a real 5-10 step task with a middle failure and recovers', async () => {
    let firstCall = true;
    let sawAppleBackend = false;
    let sawObservationOnReplan = false;
    const planStepCounts: number[] = [];
    const backendsUsed: string[] = [];

    const injectedReasonForRun: typeof reasonForRun = (p, opts) => {
      const outer = reasonForRun(p, opts);
      if (opts?.backend) {
        sawAppleBackend = sawAppleBackend || opts.backend === 'apple';
        backendsUsed.push(opts.backend);
      }
      if (opts?.observation) sawObservationOnReplan = true;

      const result = outer.result;

      if (result.kind === 'executionPlan') {
        planStepCounts.push(result.plan.steps.length);

        // Inject exactly once, on the first plan only.
        if (firstCall) {
          firstCall = false;
          const steps = result.plan.steps;
          if (steps.length >= 2) {
            // Prefer the last `tap` step; never the first step, so at least one
            // genuinely successful action precedes the injected failure.
            const lastTap = [...steps]
              .map((s, i) => [s, i] as const)
              .filter(([s]) => s.capabilityId === 'tap')
              .pop()?.[1];
            const at = Math.min(Math.max(1, lastTap ?? 1), steps.length - 1);
            const replaced = steps[at];

            // Ensure a goal exists so the action mapper derives the
            // (unresolvable) tap label from it. If the plan step's goalId isn't
            // in the goal list, synthesize one bound to this step.
            let goal = outer.intent.goals.find((g) => g.id === replaced.goalId);
            if (!goal) {
              goal = {
                id: replaced.goalId ?? 'injected-goal',
                kind: 'tap',
                description: `Tap "${ATHENA_INJECTED_MISSING_ELEMENT}"`,
              };
              outer.intent.goals.push(goal);
              replaced.goalId = goal.id;
            }
            goal.description = `Tap "${ATHENA_INJECTED_MISSING_ELEMENT}"`;
            steps[at] = {
              ...replaced,
              id: replaced.id,
              capabilityId: 'tap',
              action: 'tap',
              description: `tap "${ATHENA_INJECTED_MISSING_ELEMENT}"`,
              goalId: goal.id,
            };
          }
        }
      }
      return outer;
    };

    const goal =
      'Open Settings, search for Fitness, open the relevant result, and verify the Fitness settings screen is displayed.';

    const outcome = await runOnDevice({ prompt: goal, backend: 'apple' }, injectedReasonForRun);

    // --- Requirement 7 assertions -----------------------------------------
    expect(outcome.success).toBe(true);
    if (outcome.kind !== 'executed') {
      throw new Error(`expected an executed outcome, got ${outcome.kind}`);
    }

    // Apple backend actually generated the plan and stayed selected throughout.
    expect(outcome.backendId).toMatch(/^apple/);
    expect(sawAppleBackend).toBe(true);
    expect(backendsUsed.every((b) => b === 'apple')).toBe(true);

    // Recovery generated a second plan.
    expect(outcome.attempts).toBeGreaterThanOrEqual(2);
    expect(planStepCounts.length).toBeGreaterThanOrEqual(2);

    // An intentional failure occurred (the injected missing-element tap).
    const failedStep = outcome.executed.find(
      (e) => !e.success && e.error.includes(ATHENA_INJECTED_MISSING_ELEMENT)
    );
    expect(failedStep).toBeDefined();

    // At least one real action succeeded before the failure.
    expect(
      outcome.executed.some((e) => e.success && e.stepIndex < (failedStep?.stepIndex ?? Infinity))
    ).toBe(true);

    // Recovery used the real device observation.
    expect(sawObservationOnReplan).toBe(true);

    // Previously successful work was not unnecessarily repeated: no action whose
    // stable identity (capability + target) already succeeded in attempt 1 is
    // re-executed in the recovery attempt. The launched app is the unambiguous
    // case and must execute exactly once.
    expect(outcome.executed.filter((e) => /^launch /i.test(e.description)).length).toBe(1);

    const failedAt = failedStep?.stepIndex ?? -1;
    const attempt1Actions = outcome.executed.filter((e) => e.stepIndex > failedAt);
    const accomplishedKeys = new Set(
      outcome.executed.filter((e) => e.success && e.stepIndex < failedAt).map(executedKey)
    );
    const replayed = attempt1Actions.filter((e) => accomplishedKeys.has(executedKey(e)));
    expect(replayed).toEqual([]);

    // 5-10 real actions total.
    expect(outcome.executed.length).toBeGreaterThanOrEqual(5);
    expect(outcome.executed.length).toBeLessThanOrEqual(10);

    // Final state was strongly verified and TaskMemory reports completed.
    expect(outcome.memory).toBeDefined();
    const mem = outcome.memory!;
    expect(mem.status).toBe('completed');
    expect(mem.steps.some((s) => s.capabilityId === 'verify' && s.status === 'verified')).toBe(
      true
    );

    // --- Report ------------------------------------------------------------
    const failedIndex = failedStep?.stepIndex ?? -1;
    const attempt2Actions = outcome.executed
      .filter((e) => e.stepIndex > failedIndex)
      .map((e) => e.description);
    console.log(
      JSON.stringify(
        {
          firstApplePlanSteps: planStepCounts[0],
          failedAction: failedStep?.description,
          observationCaptured: sawObservationOnReplan,
          recoveryPlanSteps: planStepCounts[planStepCounts.length - 1],
          actionsExecutedOnAttempt2: attempt2Actions,
          intentionallyNotRepeated: ['launch', 'tap Search', 'type Fitness'].filter(
            (t) => !attempt2Actions.some((d) => d.toLowerCase().includes(t.toLowerCase()))
          ),
          finalVerification: 'verified',
          taskMemoryStatus: mem.status,
          taskMemoryStepCount: mem.steps.length,
        },
        null,
        2
      )
    );
  }, 180000);
});
