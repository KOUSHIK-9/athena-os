import type { CapabilityDescriptor, CapabilityRegistry, Goal } from '@athena-os/core';

export interface CapabilityCandidate {
  capability: CapabilityDescriptor;
  reason: string;
}

export interface GoalCapabilityOptions {
  goal: Goal;
  candidates: CapabilityCandidate[];
}

export interface UnmatchedGoal {
  goal: Goal;
  reason: string;
}

export interface CapabilityMatchResult {
  goals: GoalCapabilityOptions[];
  unmatched: UnmatchedGoal[];
}

/**
 * Stage 3a: Goals → Capability Candidates
 *
 * Resolves each accepted goal to **every** capability that can satisfy it
 * (RFC-0011 §1.3). The matcher never assumes uniqueness: a goal may have
 * zero, one, or many candidates (e.g. "Open Camera" → `launch_app` or
 * `activate_existing_app`).
 *
 * Candidates carry a human-readable `reason` explaining why each was
 * selected — the reasoning is auditable, not magic.
 */
export interface CapabilityMatcher {
  matchGoals(goals: Goal[], registry: CapabilityRegistry): CapabilityMatchResult;
}

export class DeterministicCapabilityMatcher implements CapabilityMatcher {
  matchGoals(goals: Goal[], registry: CapabilityRegistry): CapabilityMatchResult {
    const capabilities = registry.capabilities();
    const options: GoalCapabilityOptions[] = [];
    const unmatched: UnmatchedGoal[] = [];

    for (const goal of goals) {
      const candidates: CapabilityCandidate[] = capabilities
        .filter((capability) => capability.goalKinds.includes(goal.kind))
        .map((capability) => ({
          capability,
          reason: `capability '${capability.id}' declares goal kind '${goal.kind}'`,
        }));

      if (candidates.length > 0) {
        options.push({ goal, candidates });
      } else {
        unmatched.push({
          goal,
          reason: `no registered capability satisfies goal kind '${goal.kind}'`,
        });
      }
    }

    return { goals: options, unmatched };
  }
}

export interface CapabilitySelection {
  goal: Goal;
  capability: CapabilityDescriptor;
  reason: string;
}

export interface SelectionResult {
  selections: CapabilitySelection[];
  unresolved: UnmatchedGoal[];
}

/**
 * Stage 3b: Candidates → Selected Capabilities
 *
 * Picks one candidate per goal. The deterministic implementation takes the
 * first candidate (registry order) — it answers *"can I?"*, not *"what's
 * best?"*. A future Plan Optimizer (RFC-0011 §7) replaces this function
 * with preference-aware selection; the interface does not change.
 */
export function selectCapabilities(result: CapabilityMatchResult): SelectionResult {
  const selections: CapabilitySelection[] = [];
  const unresolved: UnmatchedGoal[] = [];

  for (const { goal, candidates } of result.goals) {
    const first = candidates[0];
    if (first) {
      selections.push({ goal, capability: first.capability, reason: first.reason });
    } else {
      unresolved.push({
        goal,
        reason: `no registered capability satisfies goal kind '${goal.kind}'`,
      });
    }
  }

  for (const unmatchedGoal of result.unmatched) {
    unresolved.push(unmatchedGoal);
  }

  return { selections, unresolved };
}
