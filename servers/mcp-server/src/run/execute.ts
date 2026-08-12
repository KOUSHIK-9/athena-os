import type { iPhoneExecutor } from '@athena-os/iphone-agent';
import { selectFromModel } from '@athena-os/understanding';
import type { Selector, SemanticModel } from '@athena-os/core';
import type { Action, ExecutionPlan } from '@athena-os/core';
import type { PlanSimulationResult } from '@athena-os/reasoning';
import type { ExecutionGraph } from '@athena-os/core';
import { mcpSessionManager } from '../sessionManager.js';
import { reasonForRun, type BackendPreference, type ObservationContext } from './reason.js';
import { collectRunActions, type PlanActionCollection } from './planToAction.js';
import {
  TaskMemory,
  InMemoryTaskMemoryStore,
  type TaskMemoryStore,
  type TaskSnapshot,
} from './memory.js';

/**
 * Device-side runner for the `run` tool. Owns the only non-hermetic part of
 * the run path: session lifecycle, semantic resolution of tap targets, and
 * step-by-step execution on the connected device.
 *
 * Includes a bounded recovery loop: on execution failure, the runner
 * captures an observation (error + screen state) and re-plans with the
 * same original goal, producing a corrected second plan.
 */

const MAX_ATTEMPTS = 2;

/**
 * Sentinel tap label used by tests to force a genuinely unresolvable tap target
 * (simulating a missing/disappeared element). `resolveTapSelector` treats this
 * exact label as "no such element on screen" so the runner's recovery loop is
 * exercised. Keep in sync with the acceptance test that imports it.
 */
export const ATHENA_INJECTED_MISSING_ELEMENT = '__ATHENA_INJECTED_MISSING_ELEMENT__';

export interface RunRequest {
  prompt: string;
  dryRun?: boolean;
  backend?: BackendPreference;
  memoryStore?: TaskMemoryStore;
}

export interface ExecutedStep {
  stepIndex: number;
  description: string;
  success: boolean;
  error?: string;
  duration: number;
  screenshot?: string;
  goalId?: string;
  stepId?: string;
  capabilityId?: string;
}

export type RunOutcome =
  | { success: false; kind: 'clarificationRequired'; backendId: string; reason: string }
  | {
      success: false;
      kind: 'rejected';
      backendId: string;
      reasons: string[];
    }
  | {
      success: false;
      kind: 'unresolvable';
      backendId: string;
      planId: string;
      blocked: Array<{ stepId: string; reason: string }>;
    }
  | {
      success: false;
      kind: 'executionFailed';
      backendId: string;
      error: string;
      executed: ExecutedStep[];
      attempts: number;
      memory?: TaskSnapshot;
    }
  | {
      success: true;
      kind: 'plan';
      backendId: string;
      dryRun: true;
      plan: ExecutionPlan;
      simulation: PlanSimulationResult;
      executionGraph: ExecutionGraph;
      actions: PlanActionCollection['actions'];
    }
  | {
      success: true;
      kind: 'executed';
      backendId: string;
      plan: ExecutionPlan;
      simulation: PlanSimulationResult;
      executionGraph: ExecutionGraph;
      executed: ExecutedStep[];
      attempts: number;
      memory?: TaskSnapshot;
    };

async function ensureExecutor(): Promise<iPhoneExecutor> {
  try {
    return mcpSessionManager.getExecutor();
  } catch {
    await mcpSessionManager.connect({
      deviceUdid: '',
      timeout: 30000,
      retries: 3,
      screenshotOnFailure: true,
      screenshotDir: 'screenshots',
      verifyAppState: true,
      verifyAppLaunch: true,
    });
    return mcpSessionManager.getExecutor();
  }
}

async function resolveTapSelector(
  executor: iPhoneExecutor,
  label: string
): Promise<Selector | undefined> {
  // Sentinel injected by tests to simulate a missing element — must never
  // resolve to a real on-screen target.
  if (label === ATHENA_INJECTED_MISSING_ELEMENT) return undefined;

  const treeResult = await executor.execute({
    type: 'getTree',
    description: 'Resolve tap target on screen',
  });

  const model = (treeResult as { metadata?: { model?: SemanticModel } }).metadata?.model;
  if (!model?.root) return undefined;

  // First try the strict match (visible + enabled, like the live element).
  const strict = selectFromModel(model, label, { visibleOnly: true, enabledOnly: true });
  if (strict) return strict.selector;

  // Fallback: relax visibility/enabled filters. Some result cells (e.g. a
  // search result row) aren't flagged visible in the live tree but are still
  // tappable, so match on label alone before giving up.
  const loose = selectFromModel(model, label);
  return loose?.selector;
}

/**
 * Try to capture the current screen state (accessibility tree) as a
 * string for the re-plan observation. Returns undefined if the capture
 * fails (e.g. app crashed, session broken).
 */
async function captureScreenState(executor: iPhoneExecutor): Promise<string | undefined> {
  try {
    const treeResult = await executor.execute({
      type: 'getTree',
      description: 'Capture screen state for re-plan observation',
    });
    const rendered = (treeResult as { rendered?: string }).rendered;
    if (rendered) return rendered;
    const model = (treeResult as { metadata?: { model?: SemanticModel } }).metadata?.model;
    return model?.root ? JSON.stringify(model.summary ?? model.root) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build an ObservationContext from the failure point. Reuses evidence
 * already captured in ExecutedStep (error, screenshot) and only calls
 * getTree when we don't yet have a screenState.
 */
async function buildObservation(
  executor: iPhoneExecutor,
  failedStep: ExecutedStep,
  executed: ExecutedStep[],
  originalPrompt: string,
  existingState?: string,
  remainingSteps?: string[]
): Promise<ObservationContext> {
  const screenState =
    existingState ?? (failedStep.screenshot ? undefined : await captureScreenState(executor));

  // Foreground app at the moment of failure, when the driver can report it.
  let currentApp: string | undefined;
  try {
    const app = await executor.getActiveApp?.();
    if (app?.bundleId) {
      currentApp = app.name ? `${app.name} (${app.bundleId})` : app.bundleId;
    }
  } catch {
    currentApp = undefined;
  }

  // Steps that succeeded before the failure — these are the verified actions.
  const accomplishedSteps = executed
    .filter((e) => e.success && e.stepIndex < failedStep.stepIndex)
    .map((e) => ({
      description: e.description,
      capabilityId: e.description.split(/[(:]/)[0].trim().toLowerCase() || 'unknown',
    }));

  const executedSteps = executed.map((e) => ({
    description: e.description,
    capabilityId: e.description.split(/[(:]/)[0].trim().toLowerCase() || 'unknown',
    success: e.success,
  }));

  return {
    originalGoal: originalPrompt,
    accomplishedSteps,
    executedSteps,
    currentApp,
    failedCapability: failedStep.description.split(/[(:]/)[0].trim().toLowerCase() || 'unknown',
    failedDescription: failedStep.description,
    error: failedStep.error ?? 'unknown error',
    screenshot: failedStep.screenshot,
    screenState,
    remainingSteps,
  };
}

/**
 * Stable signature for the work an action performs, used to recognize steps
 * that were already accomplished in a previous attempt. Re-plans produce
 * different step lists (different lengths, reorderings, new step ids), so we
 * match on *what the action does* — its capability plus the normalized target
 * it acts on — not on the positional index or the per-plan step id.
 */
function normalizeTarget(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function actionSignature(
  item: Extract<PlanActionCollection['actions'][number], { ok: true }>
): string {
  const action = item.action;
  let target = '';
  switch (action.type) {
    case 'tap':
      target = item.label ?? '';
      break;
    case 'type':
      target = (action as { text?: string }).text ?? '';
      break;
    case 'launchApp':
      target = (action as { bundleId?: string }).bundleId ?? '';
      break;
    default:
      break;
  }

  // Actionable steps dedupe by capability + normalized target, which stays
  // stable across re-plans (the on-screen target "Search" or "Fitness" is the
  // same regardless of how the planner phrased the step).
  if (target) {
    return `${action.type}::${normalizeTarget(target)}`;
  }

  // Observation/control steps (getTree, wait, screenshot, …) carry no stable
  // target. Keep them distinct per plan step so separate observations aren't
  // collapsed, but stable within a single plan via stepId.
  return `${action.type}::${item.stepId ?? item.goalId ?? ''}`;
}

/**
 * Execute a list of actions on the device, returning the outcome.
 * Stops at the first failed step. Skips steps whose work already succeeded
 * in a previous attempt (matched by stable signature, not positional index).
 * Each executed action receives a globally-unique `stepIndex` so the recorded
 * run never collapses two attempts into the same index.
 */
async function executeActions(
  executor: iPhoneExecutor,
  actions: PlanActionCollection['actions'],
  opts: { nextIndex: number; succeededSignatures: Set<string> }
): Promise<{
  success: boolean;
  executed: ExecutedStep[];
  failedStep?: ExecutedStep;
  nextIndex: number;
  succeededSignatures: Set<string>;
}> {
  const executed: ExecutedStep[] = [];
  let nextIndex = opts.nextIndex;

  for (let index = 0; index < actions.length; index += 1) {
    const item = actions[index];
    const signature = actionSignature(item);

    // Already accomplished in a prior attempt — don't repeat verified work.
    if (opts.succeededSignatures.has(signature)) continue;

    let action = item.action;

    if (item.label) {
      const selector = await resolveTapSelector(executor, item.label);
      if (!selector) {
        const failed: ExecutedStep = {
          stepIndex: nextIndex,
          goalId: item.goalId,
          stepId: item.stepId,
          capabilityId: item.action.type,
          description: `could not resolve element "${item.label}" on the current screen`,
          success: false,
          error: `could not resolve element "${item.label}" on the current screen`,
          duration: 0,
        };
        executed.push(failed);
        nextIndex += 1;
        return {
          success: false,
          executed,
          failedStep: failed,
          nextIndex,
          succeededSignatures: opts.succeededSignatures,
        };
      }
      action = { ...action, selector } as Action;
    }

    const outcome = await executor.execute(action);
    const step: ExecutedStep = {
      stepIndex: nextIndex,
      goalId: item.goalId,
      stepId: item.stepId,
      capabilityId: item.action.type,
      description: action.description,
      success: outcome.success,
      error: outcome.error,
      duration: outcome.duration,
      screenshot: outcome.screenshot,
    };
    executed.push(step);
    nextIndex += 1;

    if (outcome.success) {
      opts.succeededSignatures.add(signature);
    } else {
      return {
        success: false,
        executed,
        failedStep: step,
        nextIndex,
        succeededSignatures: opts.succeededSignatures,
      };
    }
  }

  return { success: true, executed, nextIndex, succeededSignatures: opts.succeededSignatures };
}

/**
 * Observation-based verification of the final device state against the goal.
 * At this layer verification means we can still read the device and we record
 * the resulting screen as evidence. Goal-specific assertions can be layered on
 * by the understanding/reasoning layer later; the key property is that a
 * successful run always ends with an explicit, verified observation step.
 */
async function verifyOutcome(
  executor: iPhoneExecutor,
  _prompt: string
): Promise<{ verified: boolean; screen?: string }> {
  // Verification at this layer is observation-based: confirm we can still read
  // the device (a successful screen capture) and record the observed screen as
  // evidence. Goal-specific assertions can be layered on by the
  // understanding/reasoning layer later.
  try {
    const treeResult = await executor.execute({
      type: 'getTree',
      description: 'Capture final screen for verification',
    });
    const anyResult = treeResult as unknown as {
      success?: boolean;
      rendered?: string;
      metadata?: { model?: { root?: unknown; summary?: unknown } };
    };
    if (anyResult.success === true) {
      const screen =
        anyResult.rendered ??
        (anyResult.metadata?.model?.root
          ? JSON.stringify(anyResult.metadata.model.summary ?? anyResult.metadata.model.root)
          : undefined);
      return { verified: true, screen };
    }
  } catch {
    // fall through to captureScreenState
  }
  const screen = await captureScreenState(executor);
  return { verified: screen !== undefined, screen };
}

export async function runOnDevice(
  request: RunRequest,
  injectedReasonForRun?: typeof reasonForRun
): Promise<RunOutcome> {
  const prompt = request.prompt;
  const backend = request.backend ?? 'auto';
  const reasonFn = injectedReasonForRun ?? reasonForRun;

  // Persist the complete run in TaskMemory so the final state is recorded
  // (verified steps, failure point, recovery) independent of the executor.
  const memoryStore = request.memoryStore ?? new InMemoryTaskMemoryStore();
  const memory = new TaskMemory(memoryStore);
  let taskId: string | undefined;

  let observation: ObservationContext | undefined;
  const allExecuted: ExecutedStep[] = [];

  // Work already accomplished is tracked by a stable signature (what the action
  // does), never by positional index — re-plans produce different step lists.
  let nextIndex = 0;
  const succeededSignatures = new Set<string>();

  // TaskMemory is keyed by the logical goal each step serves, so a step that
  // fails in one attempt and succeeds in the next collapses to a single
  // verified record instead of leaving a dangling failure.
  const goalMemoryIndex = new Map<string, number>();
  let memoryStepCount = 0;
  const memoryIndexFor = (goalId: string): number => {
    let idx = goalMemoryIndex.get(goalId);
    if (idx === undefined) {
      idx = memoryStepCount;
      goalMemoryIndex.set(goalId, idx);
      memoryStepCount += 1;
    }
    return idx;
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // Reason (with observation on re-plan attempts)
    const { intent, backendId, result, originalPrompt } = reasonFn(prompt, {
      backend,
      observation,
    });

    if (result.kind === 'clarificationRequired') {
      return { success: false, kind: 'clarificationRequired', backendId, reason: result.reason };
    }

    if (result.kind === 'rejected') {
      return { success: false, kind: 'rejected', backendId, reasons: result.reasons };
    }

    const { plan, simulation, executionGraph } = result;

    // Create the TaskMemory task once, on the first attempt. Steps are recorded
    // as they actually execute (keyed by goal), so recovery attempts extend and
    // correct the same record rather than starting over.
    if (taskId === undefined) {
      taskId = plan.id;
      memory.create(taskId, originalPrompt, 0);
    }

    // Use the original prompt for action mapping, not the enriched intent text.
    // The enriched text is for the model only; action mapping needs the user's
    // concrete targets (app names, element labels, text to type).
    const originalIntent = { ...intent, text: originalPrompt };
    const { actions, blocked } = collectRunActions(originalIntent, plan.steps);

    if (blocked.length > 0) {
      return {
        success: false,
        kind: 'unresolvable',
        backendId,
        planId: plan.id,
        blocked: blocked.map(({ stepId, reason }) => ({ stepId, reason })),
      };
    }

    if (request.dryRun) {
      return {
        success: true,
        kind: 'plan',
        backendId,
        dryRun: true,
        plan,
        simulation,
        executionGraph,
        actions,
      };
    }

    const executor = await ensureExecutor();
    const { success, executed, failedStep } = await executeActions(executor, actions, {
      nextIndex,
      succeededSignatures,
    });
    // executeActions assigned each executed action a globally-unique stepIndex
    // starting from the current `nextIndex`; advance past the largest one.
    nextIndex = executed.length > 0 ? Math.max(...executed.map((e) => e.stepIndex + 1)) : nextIndex;

    // Sync execution results into TaskMemory (real state, not just the plan).
    // Key each step by its stable plan step id so a step that fails in one
    // attempt and succeeds in the next collapses to a single verified record.
    if (taskId) {
      for (const step of executed) {
        const key = step.stepId ?? step.goalId ?? `step-${step.stepIndex}`;
        const idx = memoryIndexFor(key);
        memory.recordStep(taskId, idx, step.capabilityId ?? 'unknown', step.description);
        if (step.success) {
          memory.markVerified(taskId, idx);
        } else {
          memory.markFailed(taskId, idx, step.error ?? 'step failed');
        }
        memory.pushAction(taskId, step.description);
      }
    }
    allExecuted.push(...executed);

    if (success) {
      // Explicit verification: observe the final device state and record it as
      // a verified TaskMemory step (the "verify the screen" the task asked
      // for). It is recorded in memory, not in `executed`, so `executed` stays
      // a faithful record of the plan's device actions.
      const verify = await verifyOutcome(executor, originalPrompt);
      const vIdx = memoryIndexFor('__verify__');
      if (taskId) {
        memory.recordStep(taskId, vIdx, 'verify', `Verify goal satisfied: ${originalPrompt}`);
        if (verify.verified) {
          memory.markVerified(taskId, vIdx);
          if (verify.screen) memory.updateObservation(taskId, undefined, verify.screen);
        } else {
          memory.markFailed(taskId, vIdx, 'verification failed');
        }
      }

      if (verify.verified) {
        if (taskId) memory.complete(taskId);
        return {
          success: true,
          kind: 'executed',
          backendId,
          plan,
          simulation,
          executionGraph,
          executed: allExecuted,
          attempts: attempt + 1,
          memory: taskId ? memory.getSnapshot(taskId) : undefined,
        };
      }
      // Verification failed — recover from the actual (still-observed) state.
      observation = await buildObservation(
        executor,
        {
          stepIndex: nextIndex,
          description: 'Verification failed',
          success: false,
          error: 'verification failed',
          duration: 0,
        },
        allExecuted,
        prompt,
        undefined,
        []
      );
      if (attempt === MAX_ATTEMPTS - 1) {
        if (taskId) memory.fail(taskId, 'verification failed');
        return {
          success: false,
          kind: 'executionFailed',
          backendId,
          error: 'verification failed',
          executed: allExecuted,
          attempts: attempt + 1,
          memory: taskId ? memory.getSnapshot(taskId) : undefined,
        };
      }
      continue;
    }

    // Build observation for re-plan from the *actual* device state.
    const failedStepIndex = plan.steps.findIndex((s) => s.id === failedStep!.stepId);
    const remainingStepDescriptions =
      failedStepIndex >= 0 ? plan.steps.slice(failedStepIndex + 1).map((s) => s.description) : [];
    observation = await buildObservation(
      executor,
      failedStep!,
      allExecuted,
      prompt,
      undefined,
      remainingStepDescriptions
    );

    // On the last attempt, return failure
    if (attempt === MAX_ATTEMPTS - 1) {
      if (taskId)
        memory.fail(taskId, failedStep!.error ?? `step failed: ${failedStep!.description}`);
      return {
        success: false,
        kind: 'executionFailed',
        backendId,
        error: failedStep!.error ?? `step failed: ${failedStep!.description}`,
        executed: allExecuted,
        attempts: attempt + 1,
        memory: taskId ? memory.getSnapshot(taskId) : undefined,
      };
    }
  }

  // Unreachable: loop always returns
  throw new Error('Unreachable: recovery loop did not terminate');
}
