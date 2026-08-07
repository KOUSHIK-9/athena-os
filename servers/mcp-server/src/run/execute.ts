import type { iPhoneExecutor } from '@athena-os/iphone-agent';
import { selectFromModel } from '@athena-os/understanding';
import type { Selector, SemanticModel } from '@athena-os/core';
import type { Action, ExecutionPlan } from '@athena-os/core';
import type { PlanSimulationResult } from '@athena-os/reasoning';
import type { ExecutionGraph } from '@athena-os/core';
import { mcpSessionManager } from '../sessionManager.js';
import { reasonForRun, type BackendPreference } from './reason.js';
import { collectRunActions, type PlanActionCollection } from './planToAction.js';

/**
 * Device-side runner for the `run` tool. Owns the only non-hermetic part of
 * the run path: session lifecycle, semantic resolution of tap targets, and
 * step-by-step execution on the connected device.
 */

export interface RunRequest {
  prompt: string;
  dryRun?: boolean;
  backend?: BackendPreference;
}

export interface ExecutedStep {
  stepIndex: number;
  description: string;
  success: boolean;
  error?: string;
  duration: number;
  screenshot?: string;
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
  const treeResult = await executor.execute({
    type: 'getTree',
    description: 'Resolve tap target on screen',
  });

  const model = (treeResult as { metadata?: { model?: SemanticModel } }).metadata?.model;
  if (!model?.root) return undefined;

  return selectFromModel(model, label)?.selector;
}

export async function runOnDevice(request: RunRequest): Promise<RunOutcome> {
  const { intent, backendId, result } = reasonForRun(request.prompt, {
    backend: request.backend,
  });

  if (result.kind === 'clarificationRequired') {
    return { success: false, kind: 'clarificationRequired', backendId, reason: result.reason };
  }

  if (result.kind === 'rejected') {
    return { success: false, kind: 'rejected', backendId, reasons: result.reasons };
  }

  const { plan, simulation, executionGraph } = result;
  const { actions, blocked } = collectRunActions(intent, plan.steps);

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
  const executed: ExecutedStep[] = [];

  for (let index = 0; index < actions.length; index += 1) {
    const item = actions[index];
    let action = item.action;

    if (item.label) {
      const selector = await resolveTapSelector(executor, item.label);
      if (!selector) {
        return {
          success: false,
          kind: 'executionFailed',
          backendId,
          error: `could not resolve element "${item.label}" on the current screen`,
          executed,
        };
      }
      action = { ...action, selector } as Action;
    }

    const outcome = await executor.execute(action);
    executed.push({
      stepIndex: index,
      description: action.description,
      success: outcome.success,
      error: outcome.error,
      duration: outcome.duration,
      screenshot: outcome.screenshot,
    });

    if (!outcome.success) {
      return {
        success: false,
        kind: 'executionFailed',
        backendId,
        error: outcome.error ?? `step failed: ${action.description}`,
        executed,
      };
    }
  }

  return {
    success: true,
    kind: 'executed',
    backendId,
    plan,
    simulation,
    executionGraph,
    executed,
  };
}
