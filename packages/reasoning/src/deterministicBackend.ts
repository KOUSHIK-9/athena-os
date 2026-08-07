import type { CapabilityRegistry, Intent } from '@athena-os/core';
import type { ReasoningBackend, ReasoningBackendResult } from './backend.js';
import {
  DeterministicCapabilityMatcher,
  selectCapabilities,
  type CapabilityMatcher,
} from './capabilityMatcher.js';
import { DeterministicConstraintChecker, type ConstraintChecker } from './constraintChecker.js';
import { DeterministicGoalExtractor, type GoalExtractor } from './goalExtractor.js';
import { DeterministicPlanBuilder, type PlanBuilder } from './planBuilder.js';

/**
 * RFC-0012 reference implementation of `ReasoningBackend`: the RFC-0011
 * deterministic candidate protocol.
 *
 * Owns the whole Intent → candidate journey — stages 1–4 of RFC-0011
 * (goal extraction → constraint checking → capability matching →
 * plan building) — and nothing else. The candidate ExecutionPlan it
 * returns is deliberately NOT authoritative; the engine validates it
 * (RFC-0011 §1.5), simulates it, and builds its execution graph.
 *
 * This is what `packages/reasoning-backends` certifies against the
 * canonical conformance fixtures: a conforming backend must reproduce
 * exactly what this backend produces for deterministic scenarios.
 */
export class DeterministicReasoningBackend implements ReasoningBackend {
  readonly id = 'deterministic';

  private readonly goalExtractor: GoalExtractor = new DeterministicGoalExtractor();
  private readonly constraintChecker: ConstraintChecker = new DeterministicConstraintChecker();
  private readonly capabilityMatcher: CapabilityMatcher = new DeterministicCapabilityMatcher();
  private readonly planBuilder: PlanBuilder = new DeterministicPlanBuilder();

  reason(intent: Intent, registry: CapabilityRegistry): ReasoningBackendResult {
    const goals = this.goalExtractor.extractGoals(intent);
    if (goals.length === 0) {
      return { kind: 'clarificationRequired', reason: 'intent carries no extractable goals' };
    }

    const { accepted, rejected } = this.constraintChecker.checkGoals(goals, intent.constraints);
    if (rejected.length > 0) {
      return { kind: 'rejected', reasons: rejected.map((reason) => reason.reason) };
    }

    const { goals: matchedGoals, unmatched } = this.capabilityMatcher.matchGoals(
      accepted,
      registry
    );
    if (unmatched.length > 0) {
      return {
        kind: 'clarificationRequired',
        reason: `no capability for goals: ${unmatched.map((goal) => goal.goal.kind).join(', ')}`,
      };
    }

    const { selections, unresolved } = selectCapabilities({ goals: matchedGoals, unmatched });
    if (unresolved.length > 0) {
      return {
        kind: 'clarificationRequired',
        reason: `no capability for goals: ${unresolved.map((goal) => goal.goal.kind).join(', ')}`,
      };
    }

    const plan = this.planBuilder.buildPlan({
      intentId: intent.id,
      bindings: selections.map((selection) => ({
        goal: selection.goal,
        capability: selection.capability,
      })),
    });

    return { kind: 'executionPlan', plan };
  }
}
