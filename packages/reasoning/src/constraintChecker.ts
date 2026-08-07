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
 * Enforcement follows the constraint category:
 *
 *   - `safety`:  non-negotiable. A forbid rejects the goal; no allow can
 *                override it (RFC-0007: violation = invalid plan + audit).
 *   - `hard`:    must hold. A forbid rejects the goal unless an explicit
 *                allow on the same goal kind overrides it (user override
 *                wins over default policy).
 *   - `soft`:    never rejects. Preferences; evaluated by a future Plan
 *                Optimizer (RFC-0011 §6).
 *   - `temporal`/`resource`: declared but not evaluated at reasoning time
 *                (no clock, no budget); they bind during execution.
 *
 * A constraint matches a goal when its `goalKind` matches and, if a
 * `target` is declared, the goal's target matches exactly.
 */
export interface ConstraintChecker {
  checkGoals(goals: Goal[], constraints: Constraint[]): GoalCheckResult;
}

function matches(goal: Goal, constraint: Constraint): boolean {
  if (constraint.goalKind !== goal.kind) return false;
  if (constraint.target !== undefined && constraint.target !== goal.target) {
    return false;
  }
  return true;
}

function describe(constraint: Constraint): string {
  const reason = constraint.reason || constraint.id;
  return `${reason} (${constraint.category})`;
}

export class DeterministicConstraintChecker implements ConstraintChecker {
  checkGoals(goals: Goal[], constraints: Constraint[]): GoalCheckResult {
    const accepted: Goal[] = [];
    const rejected: RejectedGoal[] = [];

    for (const goal of goals) {
      const applicable = constraints.filter((constraint) => matches(goal, constraint));
      const forbids = applicable.filter((constraint) => constraint.kind === 'forbid');
      const allows = applicable.filter((constraint) => constraint.kind === 'allow');

      const safetyBlocks = forbids
        .filter((constraint) => constraint.category === 'safety')
        .map(describe);

      const hardBlocks = forbids
        .filter((constraint) => constraint.category === 'hard' && allows.length === 0)
        .map(describe);

      const blocking = [...safetyBlocks, ...hardBlocks];
      if (blocking.length > 0) {
        rejected.push({ goal, reason: blocking.join('; ') });
      } else {
        accepted.push(goal);
      }
    }

    return { accepted, rejected };
  }
}
