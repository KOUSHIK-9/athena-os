import type { CapabilityRegistry, Goal, Intent } from '@athena-os/core';
import {
  DeterministicCapabilityMatcher,
  DeterministicConstraintChecker,
  DeterministicPlanBuilder,
  selectCapabilities,
  type ReasoningBackend,
  type ReasoningBackendResult,
} from '@athena-os/reasoning';
import type { ModelClient } from './modelClient.js';

/**
 * RFC-0012 first model-backed backend.
 *
 * The model owns ONLY the open-ended semantics: turning an intent into
 * concrete goals (or asking for clarification when it cannot). Everything
 * downstream is the canonical assembly reused from the RFC-0011 domain —
 * constraint checking, capability matching/selection, plan building — so a
 * backend's candidate is structurally identical to the deterministic
 * reference and can be certified by the same conformance suite
 * (RFC-0012 §Parity, §Behavioral).
 *
 * Structured `intent.goals` are honored verbatim (ids and order preserved)
 * and are never routed to a model: explicit declarations win.
 */
export class LlmReasoningBackend implements ReasoningBackend {
  readonly id: string;

  private readonly constraintChecker = new DeterministicConstraintChecker();
  private readonly capabilityMatcher = new DeterministicCapabilityMatcher();
  private readonly planBuilder = new DeterministicPlanBuilder();

  constructor(private readonly modelClient: ModelClient) {
    this.id = `llm:${modelClient.id}`;
  }

  reason(intent: Intent, registry: CapabilityRegistry): ReasoningBackendResult {
    const { goals, clarification } = this.goalsFor(intent);
    if (goals.length === 0) {
      return {
        kind: 'clarificationRequired',
        reason: clarification ?? 'intent carries no extractable goals',
      };
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

  private goalsFor(intent: Intent): { goals: Goal[]; clarification?: string } {
    const structured = intent.goals.filter(
      (goal) => goal.kind.length > 0 && goal.description.length > 0
    );
    if (structured.length > 0) {
      return { goals: structured };
    }

    const extraction = this.modelClient.extractGoals(intent);
    if (extraction.goals.length === 0) {
      return { goals: [], clarification: extraction.clarification };
    }

    return {
      goals: extraction.goals.map((extracted, index) => ({
        id: `goal-${index + 1}`,
        kind: extracted.kind,
        description: extracted.description,
      })),
    };
  }
}
