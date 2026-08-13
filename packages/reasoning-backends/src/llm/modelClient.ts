import type { Intent } from '@athena-os/core';

/**
 * RFC-0012 #port: how a model talks to an LLM ReasoningBackend.
 *
 * This is an implementation port owned by `packages/reasoning-backends`
 * (not by the ReasoningBackend contract): it is how a backend calls a
 * model, not what a backend is. Keeping it synchronous keeps the port
 * hermetic — a real provider adapter (OpenAI/Anthropic/Gemini) can block
 * on its HTTP call or be bridged through a worker later without changing
 * the shape of the port.
 */

export interface ExtractedGoal {
  kind: string;
  description: string;
}

export interface ModelExtraction {
  goals: ExtractedGoal[];
  /**
   * Provided when `goals` is empty: the model's own, human-readable
   * explanation of why it could not satisfy the intent.
   */
  clarification?: string;
}

/**
 * Structured context handed to a model at extraction time. Registry-aware
 * extraction injects the exact goal kinds the active `CapabilityRegistry`
 * can satisfy plus a human-readable capability reference, so the model maps
 * the user's intent onto real capabilities instead of guessing from a fixed
 * vocabulary. This never changes the downstream Athena pipeline — it only
 * sharpens what the model is allowed to emit.
 */
export interface ModelExtractionContext {
  /** Goal kinds the registry can satisfy (the only kinds worth emitting). */
  availableGoalKinds?: readonly string[];
  /** Capability descriptors for disambiguation (kind -> what it does). */
  capabilities?: ReadonlyArray<{
    id: string;
    description: string;
    goalKinds: string[];
  }>;
}

export interface ModelClient {
  /** Stable identifier, e.g. 'stub', or a future 'gpt-5.5'. */
  readonly id: string;
  extractGoals(intent: Intent, context?: ModelExtractionContext): ModelExtraction;
}
