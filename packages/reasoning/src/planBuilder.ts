import type { CapabilityDescriptor, ExecutionPlan, Goal, PlanStep } from '@athena-os/core';

export interface PlanInput {
  intentId: string;
  goals: Goal[];
  capabilities: CapabilityDescriptor[];
}

/**
 * Stage 4: Capabilities → Execution Plan
 *
 * Assembles an Execution Plan (RFC-0006) from the matched capabilities.
 * The deterministic implementation emits one sequential step per goal,
 * ordered by goal declaration order.
 */
export interface PlanBuilder {
  buildPlan(input: PlanInput): ExecutionPlan;
}

export class DeterministicPlanBuilder implements PlanBuilder {
  buildPlan(input: PlanInput): ExecutionPlan {
    const steps: PlanStep[] = input.goals.map((goal, index) => {
      const capability = input.capabilities[index];
      return {
        id: `step-${index + 1}`,
        goalId: goal.id,
        capabilityId: capability.id,
        action: 'execute',
        description: `Satisfy '${goal.kind}' with '${capability.id}'`,
        dependsOn: index === 0 ? [] : [`step-${index}`],
      };
    });

    return {
      id: `plan-${input.intentId}`,
      intentId: input.intentId,
      steps,
    };
  }
}
