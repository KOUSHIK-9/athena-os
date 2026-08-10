import type {
  CapabilityDescriptor,
  CapabilityRegistry,
  ExecutionPlan,
  SimulationEnvironment,
} from '@athena-os/core';

export type PredictedOutcome =
  'success' | 'likely_success' | 'likely_failure' | 'failure' | 'unknown';

export interface StepPrediction {
  stepId: string;
  capabilityId: string;
  outcome: PredictedOutcome;
  confidence: number;
  reasons: string[];
}

export interface PlanSimulationResult {
  steps: StepPrediction[];
  overallConfidence: number;
  blocked: string[];
  warnings: string[];
}

/**
 * Stage 6: Execution Plan → Simulation
 *
 * Predicts what would probably happen if the plan were executed — without
 * executing it. No I/O, no device access, no execution code (RFC-0011 §2).
 *
 * Predictions are deterministic and derived only from:
 *  - the capability's declared `availability` (RFC-0004 §Capability),
 *  - its declared `reliability` (RFC-0009, Confidence),
 *  - its declared `requiresResources` against the `SimulationEnvironment`
 *    (RFC-0009 input: Environment / Resources),
 *  - the plan's own structure.
 *
 * Simulation never blocks execution: it reports. `blocked` lists
 * capabilities declared unavailable; `warnings` list missing resources or
 * low confidence. The platform decides what to do with them (RFC-0008).
 */
export interface Simulator {
  simulate(
    plan: ExecutionPlan,
    environment: SimulationEnvironment,
    registry: CapabilityRegistry
  ): PlanSimulationResult;
}

const EMPTY_ENVIRONMENT: SimulationEnvironment = { availableResources: [] };

export class DeterministicSimulator implements Simulator {
  simulate(
    plan: ExecutionPlan,
    environment: SimulationEnvironment = EMPTY_ENVIRONMENT,
    registry: CapabilityRegistry
  ): PlanSimulationResult {
    const descriptors = new Map(registry.capabilities().map((c) => [c.id, c]));
    const steps: StepPrediction[] = [];
    const blocked: string[] = [];
    const warnings: string[] = [];

    for (const step of plan.steps) {
      const descriptor = descriptors.get(step.capabilityId);
      const prediction = descriptor
        ? predictStep(step.capabilityId, descriptor, environment)
        : {
            outcome: 'unknown' as const,
            confidence: 0,
            reasons: [`capability '${step.capabilityId}' is not in the registry`],
          };

      steps.push({
        stepId: step.id,
        capabilityId: step.capabilityId,
        outcome: prediction.outcome,
        confidence: prediction.confidence,
        reasons: prediction.reasons,
      });

      if (prediction.outcome === 'failure') {
        blocked.push(step.capabilityId);
      } else if (prediction.outcome === 'likely_failure' || prediction.outcome === 'unknown') {
        warnings.push(
          `${step.capabilityId} (${prediction.outcome}): ${prediction.reasons.join('; ') || 'no declared reliability'}`
        );
      }
    }

    const overallConfidence =
      steps.length === 0 ? 0 : steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length;

    return { steps, overallConfidence, blocked, warnings };
  }
}

function predictStep(
  capabilityId: string,
  descriptor: CapabilityDescriptor,
  environment: SimulationEnvironment
): { outcome: PredictedOutcome; confidence: number; reasons: string[] } {
  const availability = descriptor.availability ?? 'available';
  const requiresResources = descriptor.requiresResources ?? [];
  const availableResources = environment.availableResources ?? [];
  const reasons: string[] = [];

  if (availability === 'unavailable') {
    return {
      outcome: 'failure',
      confidence: 0,
      reasons: [`capability is declared unavailable`],
    };
  }

  const missing = requiresResources.filter((resource) => !availableResources.includes(resource));
  if (missing.length > 0) {
    reasons.push(`missing resource(s): ${missing.join(', ')}`);
  }

  if (availability === 'conditional') {
    reasons.push('availability is conditional (may require approval)');
  }

  // Nothing is declared: honesty, not optimism.
  if (descriptor.reliability === undefined) {
    return {
      outcome: missing.length > 0 ? 'likely_failure' : 'unknown',
      confidence: missing.length > 0 ? 0.25 : 0.5,
      reasons:
        reasons.length > 0
          ? reasons
          : ['capability declares no reliability; prediction is unknown'],
    };
  }

  const { reliability } = descriptor;

  if (missing.length > 0) {
    return { outcome: 'likely_failure', confidence: reliability * 0.5, reasons };
  }

  if (descriptor.availability === 'conditional') {
    return { outcome: 'likely_success', confidence: reliability, reasons };
  }

  if (reliability >= 0.75) return { outcome: 'success', confidence: reliability, reasons };
  if (reliability >= 0.5) return { outcome: 'likely_success', confidence: reliability, reasons };
  return { outcome: 'likely_failure', confidence: reliability, reasons };
}
