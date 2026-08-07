import type { CapabilityDescriptor, CapabilityRegistry, Goal } from '@athena-os/core';

export interface UnmatchedGoal {
  goal: Goal;
  reason: string;
}

export interface CapabilityMatchResult {
  matches: CapabilityDescriptor[];
  unmatched: UnmatchedGoal[];
}

/**
 * Stage 3: Goals → Capabilities
 *
 * Resolves each accepted goal to a capability capable of satisfying it
 * (RFC-0011). The deterministic implementation picks the first capability
 * in the registry whose `goalKinds` includes the goal's kind.
 */
export interface CapabilityMatcher {
  matchGoals(goals: Goal[], registry: CapabilityRegistry): CapabilityMatchResult;
}

export class DeterministicCapabilityMatcher implements CapabilityMatcher {
  matchGoals(goals: Goal[], registry: CapabilityRegistry): CapabilityMatchResult {
    const capabilities = registry.capabilities();
    const matches: CapabilityDescriptor[] = [];
    const unmatched: UnmatchedGoal[] = [];

    for (const goal of goals) {
      const capability = capabilities.find((c) => c.goalKinds.includes(goal.kind));
      if (capability) {
        matches.push(capability);
      } else {
        unmatched.push({
          goal,
          reason: `no registered capability satisfies goal kind '${goal.kind}'`,
        });
      }
    }

    return { matches, unmatched };
  }
}
