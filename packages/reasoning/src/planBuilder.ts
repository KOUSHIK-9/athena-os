import type { CapabilityDescriptor, ExecutionPlan, Goal, PlanStep } from '@athena-os/core';

export interface GoalCapabilityBinding {
  goal: Goal;
  capability: CapabilityDescriptor;
}

export interface PlanInput {
  intentId: string;
  bindings: GoalCapabilityBinding[];
}

/**
 * Stage 4: Bindings → Execution Plan
 *
 * Assembles an Execution Plan (RFC-0006) from explicit goal↔capability
 * bindings. The builder is deliberately stupid: it performs no selection,
 * no optimization, no search — only construction. One sequential step per
 * binding, in binding order.
 */
export interface PlanBuilder {
  buildPlan(input: PlanInput): ExecutionPlan;
}

export class DeterministicPlanBuilder implements PlanBuilder {
  buildPlan(input: PlanInput): ExecutionPlan {
    const steps: PlanStep[] = input.bindings.map((binding, index) => ({
      id: `step-${index + 1}`,
      goalId: binding.goal.id,
      capabilityId: binding.capability.id,
      action: 'execute',
      description: `Satisfy '${binding.goal.kind}' with '${binding.capability.id}'`,
      dependsOn: index === 0 ? [] : [`step-${index}`],
    }));

    return {
      id: `plan-${input.intentId}`,
      intentId: input.intentId,
      steps,
    };
  }
}
