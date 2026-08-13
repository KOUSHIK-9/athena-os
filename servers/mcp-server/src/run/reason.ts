import type { Intent, MemoryReader, SimulationEnvironment } from '@athena-os/core';
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
  AppleModelClient,
  AppleModelUnavailableError,
  appleModelConfigFromEnv,
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

export type BackendPreference = 'auto' | 'deterministic' | 'llm' | 'apple';

const OPENAI_KEY_ENV = 'ATHENA_OPENAI_API_KEY';

/**
 * Observation from a failed execution attempt, used for step-level
 * re-planning. The original user goal stays stable; this tells the
 * model what's been accomplished and what still needs to happen.
 */
export interface ObservationContext {
  /** Original user goal, kept stable across re-plans. */
  originalGoal: string;
  /** Steps that already succeeded (verified) before the failure. */
  accomplishedSteps: Array<{ description: string; capabilityId: string }>;
  /** Recent executed steps (succeeded and failed) for context. */
  executedSteps?: Array<{ description: string; capabilityId?: string; success: boolean }>;
  /** The capability ID that failed (e.g. 'tap', 'type'). */
  failedCapability: string;
  /** The description of the failed step (the failed action). */
  failedDescription: string;
  /** Error message from the failed execution (failure reason). */
  error: string;
  /** Foreground app (name + bundle id) at the time of failure, if known. */
  currentApp?: string;
  /** Base64 screenshot captured at the time of failure, if available. */
  screenshot?: string;
  /** Accessibility tree / semantic model at the time of failure, if captured. */
  screenState?: string;
  /** Descriptions of the plan steps that still remain after the failure. */
  remainingSteps?: string[];
}

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

/**
 * Build an enriched prompt that preserves the original user goal and adds
 * step-level observation context. The model sees what's been accomplished,
 * what failed, and what still needs to happen — then produces a plan that
 * continues from the current state, not from scratch.
 */
export function promptWithObservation(original: string, observation: ObservationContext): string {
  const parts = [`Original user goal: ${original}`, ''];

  if (observation.currentApp) {
    parts.push(`Current app: ${observation.currentApp}`);
  }

  if (observation.screenState) {
    parts.push(`Current screen (accessibility tree): ${observation.screenState}`);
  }

  if (observation.accomplishedSteps.length > 0) {
    parts.push('Verified actions already completed:');
    for (const step of observation.accomplishedSteps) {
      parts.push(`  ✓ ${step.description} (${step.capabilityId})`);
    }
    parts.push('');
  }

  if (observation.executedSteps && observation.executedSteps.length > 0) {
    parts.push('Recent actions:');
    for (const step of observation.executedSteps) {
      parts.push(
        `  ${step.success ? '✓' : '✗'} ${step.description}${
          step.capabilityId ? ` (${step.capabilityId})` : ''
        }`
      );
    }
    parts.push('');
  }

  parts.push(
    'Failed action:',
    `  ✗ ${observation.failedDescription} (${observation.failedCapability})`,
    `Failure reason: ${observation.error}`
  );

  if (observation.remainingSteps && observation.remainingSteps.length > 0) {
    parts.push('', 'Remaining to accomplish:');
    for (const step of observation.remainingSteps) {
      parts.push(`  - ${step}`);
    }
  }

  parts.push(
    '',
    'Produce a plan that continues from the current state.',
    'Do NOT repeat the verified actions already completed.',
    'Only plan the remaining actions needed to satisfy the original goal.'
  );

  return parts.join('\n');
}

export interface ReasonOptions {
  backend?: BackendPreference;
  environment?: SimulationEnvironment;
  /** Observation from a failed attempt, when re-planning. */
  observation?: ObservationContext;
  /** Optional Memory handoff (RFC-0013 §The Contract): prior facts/preferences. */
  memory?: MemoryReader;
}

export interface RunReasoning {
  intent: Intent;
  backendId: string;
  result: ReasoningResult;
  /** Original user prompt before observation enrichment. */
  originalPrompt: string;
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

  if (preference === 'apple') {
    const modelClient = new AppleModelClient(appleModelConfigFromEnv());
    return { backend: new LlmReasoningBackend(modelClient), id: `apple:${modelClient.id}` };
  }

  if (preference === 'llm' || (preference === 'auto' && !!process.env[OPENAI_KEY_ENV])) {
    const modelClient = new OpenAIModelClient(openAIConfigFromEnv());
    return { backend: new LlmReasoningBackend(modelClient), id: `llm:${modelClient.id}` };
  }

  // `auto` prefers the on-device Apple backend (local, free, highest quality
  // per the reasoning-backend benchmark); `reasonForRun` falls back to
  // deterministic automatically when Apple Intelligence is unavailable.
  if (preference === 'auto') {
    const modelClient = new AppleModelClient(appleModelConfigFromEnv());
    return { backend: new LlmReasoningBackend(modelClient), id: `apple:${modelClient.id}` };
  }

  return { backend: new DeterministicReasoningBackend(), id: 'deterministic' };
}

export function reasonForRun(prompt: string, options: ReasonOptions = {}): RunReasoning {
  const preference = options.backend ?? 'auto';
  const { backend, id } = resolveBackend(preference);

  // The explicit Apple backend must call AppleModelClient.extractGoals(), which
  // drives the on-device FoundationModels bridge, to produce its goals. Pre-filling
  // intent.goals with the deterministic extractor would short-circuit
  // LlmReasoningBackend.goalsFor (it returns pre-populated goals verbatim) and the
  // Apple model would never be consulted — a silent deterministic bypass. So for
  // backend=apple we hand the model an intent with empty goals and let it extract.
  // Every other backend keeps the deterministic pre-fill (the historical default).
  const intent =
    preference === 'apple'
      ? makeIntent(prompt)
      : enrichIntentWithExtractedGoals(makeIntent(prompt));

  // When re-planning, enrich the intent text with observation context.
  // The original goals are preserved — only the text sent to the model changes.
  if (options.observation) {
    intent.text = promptWithObservation(prompt, options.observation);
  }

  const engine = new ReasoningEngine(iphoneRunRegistry, {
    backend,
    planValidator: new DeterministicPlanValidator(),
    simulator: new DeterministicSimulator(),
    executionGraphBuilder: new DeterministicExecutionGraphBuilder(),
    ...(options.memory ? { memory: options.memory } : {}),
  });

  let result;
  try {
    result = engine.reason(intent, options.environment);
  } catch (error) {
    // For `auto`, if the on-device Apple model is unavailable (Apple Intelligence
    // disabled / ineligible / assets not ready) fall back to the deterministic
    // backend rather than failing. An explicit `apple` choice still surfaces the
    // error so the caller sees the real cause.
    if (preference === 'auto' && error instanceof AppleModelUnavailableError) {
      const det = resolveBackend('deterministic');
      const detIntent = enrichIntentWithExtractedGoals(makeIntent(prompt));
      if (options.observation) {
        detIntent.text = promptWithObservation(prompt, options.observation);
      }
      const detEngine = new ReasoningEngine(iphoneRunRegistry, {
        backend: det.backend,
        planValidator: new DeterministicPlanValidator(),
        simulator: new DeterministicSimulator(),
        executionGraphBuilder: new DeterministicExecutionGraphBuilder(),
        ...(options.memory ? { memory: options.memory } : {}),
      });
      return finalizeReason(
        detIntent,
        det.id,
        detEngine.reason(detIntent, options.environment),
        prompt
      );
    }
    throw error;
  }

  return finalizeReason(intent, id, result, prompt);
}

/**
 * Persist model-extracted goals onto the owned intent and assemble the result.
 * Model backends return `result.goals`; the deterministic backend pre-fills
 * `intent.goals` itself, so that path is a no-op. We write goals back here
 * rather than mutating the backend's input intent (callers may reuse it across
 * backends, e.g. conformance).
 */
function finalizeReason(
  intent: Intent,
  backendId: string,
  result: ReasoningResult,
  prompt: string
): RunReasoning {
  if (result.kind === 'executionPlan' && result.goals) {
    intent.goals = result.goals;
  }
  return { intent, backendId, result, originalPrompt: prompt };
}
