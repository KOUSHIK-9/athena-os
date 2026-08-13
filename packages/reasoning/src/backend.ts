import type {
  CapabilityRegistry,
  ExecutionPlan,
  Goal,
  Intent,
  MemoryEntry,
  MemoryReader,
} from '@athena-os/core';

/**
 * RFC-0012 Reasoning Backend contract.
 *
 * A ReasoningBackend transforms an Intent into a *candidate* result. It is
 * deliberately NOT the final authority (RFC-0009):
 *
 *   Intent
 *     ↓
 *   ReasoningBackend          ← this contract (a candidate plan)
 *     ↓
 *   Candidate Plan
 *     ↓
 *   Validator                 ← the authority (RFC-0011 §1.5)
 *     ↓
 *   Simulation                ← deterministic, engine-owned
 *     ↓
 *   Execution Graph Builder   ← deterministic, engine-owned
 *     ↓
 *   Final ReasoningResult
 *
 * The backend never bypasses validation, simulation, or graph generation.
 * It is an implementation detail behind the RFC-0009 contract — today the
 * DeterministicReasoningEngine, tomorrow an LLM — and it may be swapped
 * without touching anything downstream.
 *
 * The backend owns the whole Intent → candidate journey (goal extraction,
 * constraint inference, candidate plan assembly, clarification requests),
 * so a future backend may do more than the deterministic lexicon without
 * changing the rest of the engine (RFC-0012 §Contract).
 */
export type ReasoningBackendResult =
  | {
      kind: 'executionPlan';
      plan: ExecutionPlan;
      goals?: Goal[];
      retrievedMemory?: readonly MemoryEntry[];
    }
  | { kind: 'clarificationRequired'; reason: string; retrievedMemory?: readonly MemoryEntry[] }
  | { kind: 'rejected'; reasons: string[]; retrievedMemory?: readonly MemoryEntry[] };

export interface ReasoningBackend {
  readonly id: string;
  /**
   * Optional read-only Memory handoff (RFC-0013 §The Contract). The engine
   * sets this before calling `reason`; the backend reads it to retrieve prior
   * facts/preferences/experiences. `reason(intent, registry)` is unchanged —
   * memory is delivered entirely out-of-band through this property.
   */
  memory?: MemoryReader;
  reason(intent: Intent, registry: CapabilityRegistry): ReasoningBackendResult;
}
