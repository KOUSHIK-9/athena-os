import type {
  CapabilityRegistry,
  ExecutionPlan,
  PlanStep,
} from '@athena-os/core';

export interface PlanViolation {
  stepId?: string;
  message: string;
}

export interface PlanValidationResult {
  valid: boolean;
  violations: PlanViolation[];
}

/**
 * Stage 5: Execution Plan → Valid / Invalid
 *
 * Checks the plan against the RFC-0006 Plan Invariants:
 *  - non-empty step sequence
 *  - every step resolves to a registered capability
 *  - unique step ids
 *  - `dependsOn` references only existing steps
 */
export interface PlanValidator {
  validatePlan(
    plan: ExecutionPlan,
    registry: CapabilityRegistry
  ): PlanValidationResult;
}

export class DeterministicPlanValidator implements PlanValidator {
  validatePlan(
    plan: ExecutionPlan,
    registry: CapabilityRegistry
  ): PlanValidationResult {
    const violations: PlanViolation[] = [];
    const capabilities = registry.capabilities();

    if (plan.steps.length === 0) {
      violations.push({ message: 'execution plan contains no steps' });
    }

    const stepIds = new Set<string>();
    for (const step of plan.steps) {
      if (stepIds.has(step.id)) {
        violations.push({ stepId: step.id, message: 'duplicate step id' });
      }
      stepIds.add(step.id);

      if (!capabilities.some((c) => c.id === step.capabilityId)) {
        violations.push({
          stepId: step.id,
          message: `step references unknown capability '${step.capabilityId}'`,
        });
      }

      for (const dependency of step.dependsOn) {
        if (!stepIds.has(dependency) && !plan.steps.some((s) => s.id === dependency)) {
          violations.push({
            stepId: step.id,
            message: `step depends on unknown step '${dependency}'`,
          });
        }
      }
    }

    return { valid: violations.length === 0, violations };
  }
}

export function isPlanValid(result: PlanValidationResult): boolean {
  return result.valid;
}

export type { PlanStep };
