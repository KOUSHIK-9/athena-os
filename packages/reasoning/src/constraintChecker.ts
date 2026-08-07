import type { Constraint, Goal } from '@athena-os/core';

export interface RejectedGoal {
  goal: Goal;
  reason: string;
}

export interface GoalCheckResult {
  accepted: Goal[];
  rejected: RejectedGoal[];
}

/**
 * Stage 2: Goals → Validated Goals
 *
 * Applies the intent's constraints (RFC-0007) to the extracted goals.
 * The deterministic implementation checks each goal's kind against
 * `forbid` constraints, honoring explicit `allow` overrides.
 */
export interface ConstraintChecker {
  checkGoals(goals: Goal[], constraints: Constraint[]): GoalCheckResult;
}

export class DeterministicConstraintChecker implements ConstraintChecker {
  checkGoals(goals: Goal[], constraints: Constraint[]): GoalCheckResult {
    const accepted: Goal[] = [];
    const rejected: RejectedGoal[] = [];

    for (const goal of goals) {
      const forbidding = constraints.filter(
        (constraint) =>
          constraint.kind === 'forbid' && constraint.goalKind === goal.kind
      );
      const allowed = constraints.some(
        (constraint) =>
          constraint.kind === 'allow' && constraint.goalKind === goal.kind
      );

      if (forbidding.length > 0 && !allowed) {
        rejected.push({
          goal,
          reason: forbidding.map((c) => c.reason || c.id).join('; '),
        });
      } else {
        accepted.push(goal);
      }
    }

    return { accepted, rejected };
  }
}
