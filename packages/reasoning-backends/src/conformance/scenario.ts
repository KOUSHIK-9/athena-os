import type { CapabilityRegistry, Intent } from '@athena-os/core';
import type { ReasoningBackendResult } from '@athena-os/reasoning';

export type ConformanceLayer = 'parity' | 'behavioral';

/**
 * A conformance scenario: one intent, one registry, one expected result.
 *
 * - `parity` scenarios: the expected result is the frozen output of the
 *   deterministic reference backend (RFC-0011). Every backend — including a
 *   future LLM — must reproduce the canonical ExecutionPlan exactly.
 * - `behavioral` scenarios: no deterministic baseline exists. The expected
 *   result is the authored oracle of what conforming reasoning looks like
 *   (RFC-0009 contract: valid plans for free-form intent).
 *
 * Comparison is deep equality of the whole ReasoningBackendResult — the
 * plan, not "contains the same goals" (RFC-0012 §Conformance).
 */
export interface ConformanceScenario {
  id: string;
  layer: ConformanceLayer;
  intent: Intent;
  registry: CapabilityRegistry;
  expected: ReasoningBackendResult;
}
