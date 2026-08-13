import type { CapabilityRegistry, Goal, Intent, MemoryEntry, MemoryReader } from '@athena-os/core';
import {
  DeterministicCapabilityMatcher,
  DeterministicConstraintChecker,
  DeterministicPlanBuilder,
  selectCapabilities,
  type ReasoningBackend,
  type ReasoningBackendResult,
} from '@athena-os/reasoning';
import { DeterministicRetriever, type RetrievalRequest } from '@athena-os/memory';
import type { ModelClient, ModelExtractionContext } from './modelClient.js';

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
  private readonly retriever = new DeterministicRetriever();

  /** Optional Memory handoff (RFC-0013 §The Contract); set by the engine. */
  memory?: MemoryReader;

  constructor(private readonly modelClient: ModelClient) {
    this.id = `llm:${modelClient.id}`;
  }

  reason(intent: Intent, registry: CapabilityRegistry): ReasoningBackendResult {
    const context = this.extractionContext(registry);
    const { goals, clarification } = this.goalsFor(intent, context);
    const retrieved: readonly MemoryEntry[] = context.memory ?? [];

    if (goals.length === 0) {
      return {
        kind: 'clarificationRequired',
        reason: clarification ?? 'intent carries no extractable goals',
        ...(retrieved.length > 0 ? { retrievedMemory: retrieved } : {}),
      };
    }

    const { accepted, rejected } = this.constraintChecker.checkGoals(goals, intent.constraints);
    if (rejected.length > 0) {
      return {
        kind: 'rejected',
        reasons: rejected.map((reason) => reason.reason),
        ...(retrieved.length > 0 ? { retrievedMemory: retrieved } : {}),
      };
    }

    const { goals: matchedGoals, unmatched } = this.capabilityMatcher.matchGoals(
      accepted,
      registry
    );
    if (unmatched.length > 0) {
      return {
        kind: 'clarificationRequired',
        reason: `no capability for goals: ${unmatched.map((goal) => goal.goal.kind).join(', ')}`,
        ...(retrieved.length > 0 ? { retrievedMemory: retrieved } : {}),
      };
    }

    const { selections, unresolved } = selectCapabilities({ goals: matchedGoals, unmatched });
    if (unresolved.length > 0) {
      return {
        kind: 'clarificationRequired',
        reason: `no capability for goals: ${unresolved.map((goal) => goal.goal.kind).join(', ')}`,
        ...(retrieved.length > 0 ? { retrievedMemory: retrieved } : {}),
      };
    }

    const plan = this.planBuilder.buildPlan({
      intentId: intent.id,
      bindings: selections.map((selection) => ({
        goal: selection.goal,
        capability: selection.capability,
      })),
    });

    return {
      kind: 'executionPlan',
      plan,
      goals,
      ...(retrieved.length > 0 ? { retrievedMemory: retrieved } : {}),
    };
  }

  /**
   * Derive the registry-aware extraction context: the exact goal kinds the
   * active registry can satisfy plus a capability reference, so the model
   * maps intent onto real capabilities instead of a fixed vocabulary. When a
   * `MemoryReader` was handed off, prior facts/preferences are retrieved and
   * included so the model reasons with remembered context (RFC-0013/0014).
   */
  private extractionContext(registry: CapabilityRegistry): ModelExtractionContext {
    const caps = registry.capabilities();
    const availableGoalKinds = Array.from(new Set(caps.flatMap((cap) => cap.goalKinds)));
    const context: ModelExtractionContext = {
      availableGoalKinds,
      capabilities: caps.map((cap) => ({
        id: cap.id,
        description: cap.description,
        goalKinds: cap.goalKinds,
      })),
    };

    if (this.memory) {
      const request: RetrievalRequest = { intentKind: '', requested: [] };
      context.memory = this.retriever.retrieve(request, this.memory).entries;
    }

    return context;
  }

  private goalsFor(
    intent: Intent,
    context?: ModelExtractionContext
  ): { goals: Goal[]; clarification?: string } {
    const structured = intent.goals.filter(
      (goal) => goal.kind.length > 0 && goal.description.length > 0
    );
    if (structured.length > 0) {
      return { goals: structured };
    }

    const extraction = this.modelClient.extractGoals(intent, context);
    if (extraction.goals.length === 0) {
      return { goals: [], clarification: extraction.clarification };
    }

    const goals: Goal[] = extraction.goals.map((extracted, index) => ({
      id: `goal-${index + 1}`,
      kind: extracted.kind,
      description: extracted.description,
    }));

    // Return the extracted goals so the caller can persist them on the intent
    // for downstream execution. We deliberately do NOT mutate the input `intent`
    // here: some call sites (e.g. conformance suites) reuse the same intent
    // object across multiple backends, and a mutation would leak this backend's
    // goals into the next one. The deterministic backend gets the same effect
    // from `enrichIntentWithExtractedGoals` pre-filling `intent.goals`; the
    // model backend's caller (`reasonForRun`) writes `result.goals` back onto
    // the intent it owns. Execution (`planToAction`) resolves concrete targets
    // (app name, element label, typed text) from these goals by `goalId` — the
    // generic plan-step description ("Satisfy 'openApp' with 'launchApp'") does
    // NOT carry them, so without this write-back every app/label/text argument
    // falls back to the entire prompt and the plan is unresolvable.
    return { goals };
  }
}
