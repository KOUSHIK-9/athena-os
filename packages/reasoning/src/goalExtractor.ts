import type { Goal, Intent } from '@athena-os/core';

/**
 * Stage 1: Intent → Goal[]
 *
 * Extracts the concrete goals an intent contains. The deterministic
 * implementation reads the structured goals carried by the Intent
 * (RFC-0005); it never infers goals from free text.
 */
export interface GoalExtractor {
  extractGoals(intent: Intent): Goal[];
}

export class DeterministicGoalExtractor implements GoalExtractor {
  extractGoals(intent: Intent): Goal[] {
    return intent.goals.filter(
      (goal) => goal.kind.length > 0 && goal.description.length > 0
    );
  }
}
