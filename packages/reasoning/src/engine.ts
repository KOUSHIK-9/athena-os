import type {
  CapabilityRegistry,
  ExecutionPlan,
  Intent,
} from '@athena-os/core';
import { DeterministicGoalExtractor, type GoalExtractor } from './goalExtractor.js';
import {
  DeterministicConstraintChecker,
  type ConstraintChecker,
} from './constraintChecker.js';
import {
  DeterministicCapabilityMatcher,
  type CapabilityMatcher,
} from './capabilityMatcher.js';
import { DeterministicPlanBuilder, type PlanBuilder } from './planBuilder.js';
import {
  DeterministicPlanValidator,
  type PlanValidator,
} from './validator.js';

export type ReasoningResult =
  | { kind: 'executionPlan'; plan: ExecutionPlan }
  | { kind: 'clarificationRequired'; reason: string }
  | { kind: 'rejected'; reasons: string[] };

export interface EngineComponents {
  goalExtractor: GoalExtractor;
  constraintChecker: ConstraintChecker;
  capabilityMatcher: CapabilityMatcher;
  planBuilder: PlanBuilder;
  planValidator: PlanValidator;
}

/**
 * RFC-0011 Deterministic Reasoning Engine.
 *
 * Composes the five pipeline stages into a single `reason` entry point.
 * Stages are injected so any of them can later be replaced by an
 * RFC-0012 (LLM) implementation behind the same interface.
 */
export class DeterministicReasoningEngine {
  private readonly components: EngineComponents;

  constructor(private readonly registry: CapabilityRegistry) {
    this.components = {
      goalExtractor: new DeterministicGoalExtractor(),
      constraintChecker: new DeterministicConstraintChecker(),
      capabilityMatcher: new DeterministicCapabilityMatcher(),
      planBuilder: new DeterministicPlanBuilder(),
      planValidator: new DeterministicPlanValidator(),
    };
  }

  reason(intent: Intent): ReasoningResult {
    const { goalExtractor, constraintChecker, capabilityMatcher, planBuilder, planValidator } =
      this.components;

    const goals = goalExtractor.extractGoals(intent);
    if (goals.length === 0) {
      return {
        kind: 'clarificationRequired',
        reason: 'intent carries no extractable goals',
      };
    }

    const { accepted, rejected } = constraintChecker.checkGoals(goals, intent.constraints);
    if (rejected.length > 0) {
      return {
        kind: 'rejected',
        reasons: rejected.map((r) => r.reason),
      };
    }

    const { matches, unmatched } = capabilityMatcher.matchGoals(accepted, this.registry);
    if (unmatched.length > 0) {
      return {
        kind: 'clarificationRequired',
        reason: `no capability for goals: ${unmatched.map((u) => u.goal.kind).join(', ')}`,
      };
    }

    const plan = planBuilder.buildPlan({
      intentId: intent.id,
      goals: accepted,
      capabilities: matches,
    });

    const validation = planValidator.validatePlan(plan, this.registry);
    if (!validation.valid) {
      return {
        kind: 'rejected',
        reasons: validation.violations.map((v) => v.message),
      };
    }

    return { kind: 'executionPlan', plan };
  }
}
