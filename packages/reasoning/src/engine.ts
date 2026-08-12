import type {
  CapabilityRegistry,
  ExecutionGraph,
  ExecutionPlan,
  Goal,
  Intent,
  SimulationEnvironment,
} from '@athena-os/core';
import type { ReasoningBackend } from './backend.js';
import { DeterministicReasoningBackend } from './deterministicBackend.js';
import {
  DeterministicExecutionGraphBuilder,
  type ExecutionGraphBuilder,
} from './executionGraphBuilder.js';
import { DeterministicSimulator, type PlanSimulationResult } from './simulator.js';
import { DeterministicPlanValidator, type PlanValidator } from './validator.js';

const EMPTY_ENVIRONMENT: SimulationEnvironment = { availableResources: [] };

export type ReasoningResult =
  | {
      kind: 'executionPlan';
      plan: ExecutionPlan;
      simulation: PlanSimulationResult;
      executionGraph: ExecutionGraph;
      goals?: Goal[];
    }
  | { kind: 'clarificationRequired'; reason: string }
  | { kind: 'rejected'; reasons: string[] };

export interface EngineComponents {
  backend: ReasoningBackend;
  planValidator: PlanValidator;
  simulator: DeterministicSimulator;
  executionGraphBuilder: ExecutionGraphBuilder;
}

/**
 * RFC-0012 backend-agnostic reasoning engine.
 *
 * The engine does not know which backend it is talking to — deterministic
 * today, LLM tomorrow — it only consumes the candidate result and applies
 * the authoritative, engine-owned stages: validation (RFC-0011 §1.5),
 * simulation, and execution graph construction. A candidate that is not
 * `executionPlan` (clarification request or rejection) is passed through
 * untouched: those are backend decisions the engine honors.
 */
export class ReasoningEngine {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly components: EngineComponents
  ) {}

  reason(intent: Intent, environment: SimulationEnvironment = EMPTY_ENVIRONMENT): ReasoningResult {
    const { backend, planValidator, simulator, executionGraphBuilder } = this.components;

    const candidate = backend.reason(intent, this.registry);
    if (candidate.kind !== 'executionPlan') {
      return candidate;
    }

    const validation = planValidator.validatePlan(candidate.plan, this.registry);
    if (!validation.valid) {
      return {
        kind: 'rejected',
        reasons: validation.errors.map((error) => error.message),
      };
    }

    const simulation = simulator.simulate(candidate.plan, environment, this.registry);
    const executionGraph = executionGraphBuilder.buildExecutionGraph(candidate.plan);

    return {
      kind: 'executionPlan',
      plan: candidate.plan,
      simulation,
      executionGraph,
      // Carry the backend-extracted goals forward so the caller can persist them
      // on the intent for downstream execution (action mapping needs the concrete
      // targets). Optional: deterministic/other backends may omit it.
      ...(candidate.goals ? { goals: candidate.goals } : {}),
    };
  }
}

/**
 * RFC-0011 reference composition: the engine wired with the deterministic
 * backend and default engine-owned stages. Kept as the convenience entry
 * point so existing call sites keep working; any `ReasoningBackend` can be
 * injected through `ReasoningEngine` instead.
 */
export class DeterministicReasoningEngine extends ReasoningEngine {
  constructor(registry: CapabilityRegistry) {
    super(registry, {
      backend: new DeterministicReasoningBackend(),
      planValidator: new DeterministicPlanValidator(),
      simulator: new DeterministicSimulator(),
      executionGraphBuilder: new DeterministicExecutionGraphBuilder(),
    });
  }
}
