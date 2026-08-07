import type { Intent, SimulationEnvironment } from '@athena-os/core';
import {
  DeterministicExecutionGraphBuilder,
  DeterministicGoalExtractor,
  DeterministicPlanValidator,
  DeterministicReasoningBackend,
  DeterministicSimulator,
  ReasoningEngine,
  type ReasoningBackend,
  type ReasoningResult,
} from '@athena-os/reasoning';
import {
  LlmReasoningBackend,
  OpenAIModelClient,
  openAIConfigFromEnv,
} from '@athena-os/reasoning-backends';
import { iphoneRunRegistry } from './registry.js';

/**
 * End-to-end reasoning entry for `athena run` / the MCP `run` tool.
 *
 * RFC-0012 wiring: intent -> backend (deterministic reference or the LLM
 * backend) -> authoritative engine stages (validation, simulation, graph).
 * Nothing here touches a device; execution is a separate concern.
 */

export type BackendPreference = 'auto' | 'deterministic' | 'llm';

const OPENAI_KEY_ENV = 'ATHENA_OPENAI_API_KEY';

/**
 * Structured `intent.goals` are consumed verbatim by every backend
 * (RFC-0005/0012). Filling them from the deterministic lexicon keeps plan
 * goal content available for the plan->action bridge even though
 * `ExecutionPlan.steps[].description` only carries capability metadata;
 * without structured goals the params (app name, label, text) are lost.
 */
function enrichIntentWithExtractedGoals(intent: Intent): Intent {
  if (intent.goals.length > 0 || !intent.text) {
    return intent;
  }
  const goals = new DeterministicGoalExtractor().extractGoals(intent);
  return goals.length > 0 ? { ...intent, goals } : intent;
}

export interface ReasonOptions {
  backend?: BackendPreference;
  environment?: SimulationEnvironment;
}

export interface RunReasoning {
  intent: Intent;
  backendId: string;
  result: ReasoningResult;
}

export function makeIntent(prompt: string): Intent {
  return {
    id: `intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: prompt,
    goals: [],
    constraints: [],
  };
}

export function resolveBackend(preference: BackendPreference = 'auto'): {
  backend: ReasoningBackend;
  id: string;
} {
  if (preference === 'deterministic') {
    return { backend: new DeterministicReasoningBackend(), id: 'deterministic' };
  }

  if (preference === 'llm' || (preference === 'auto' && !!process.env[OPENAI_KEY_ENV])) {
    const modelClient = new OpenAIModelClient(openAIConfigFromEnv());
    return { backend: new LlmReasoningBackend(modelClient), id: `llm:${modelClient.id}` };
  }

  return { backend: new DeterministicReasoningBackend(), id: 'deterministic' };
}

export function reasonForRun(prompt: string, options: ReasonOptions = {}): RunReasoning {
  const intent = enrichIntentWithExtractedGoals(makeIntent(prompt));
  const { backend, id } = resolveBackend(options.backend ?? 'auto');

  const engine = new ReasoningEngine(iphoneRunRegistry, {
    backend,
    planValidator: new DeterministicPlanValidator(),
    simulator: new DeterministicSimulator(),
    executionGraphBuilder: new DeterministicExecutionGraphBuilder(),
  });

  return { intent, backendId: id, result: engine.reason(intent, options.environment) };
}
