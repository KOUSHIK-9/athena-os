import type { MemoryEntry, MemoryReader } from '@athena-os/core';
import type { MemoryRetriever, RetrievalRequest, RetrievalResponse } from './contract.js';

const KIND_ORDER: Record<MemoryEntry['kind'], number> = {
  fact: 0,
  preference: 1,
  experience: 2,
  trigger: 3,
};

// Standing entries that apply to every intent (RFC-0014 §1). Never includes
// `trigger` — triggers are only returned when explicitly requested.
const ALWAYS_ELIGIBLE = new Set<MemoryEntry['kind']>(['fact', 'preference']);

/**
 * RFC-0014 deterministic reference retriever.
 *
 * Computes a strict total order from entry fields only — no heuristics:
 *   1. Scope: requested subjects, else the always-eligible set.
 *   2. Supersession already applied by the store (newest per subject).
 *   3. Kind ordering: fact, preference, experience, trigger.
 *   4. Stability tiebreak: recordedAt descending, then id ascending.
 */
export class DeterministicRetriever implements MemoryRetriever {
  readonly id = 'memory:deterministic';

  retrieve(request: RetrievalRequest, memory: MemoryReader): RetrievalResponse {
    const all = memory.entries();

    let selected: MemoryEntry[];
    if (request.requested.length > 0) {
      const requested = new Set(request.requested);
      selected = all.filter((e) => requested.has(e.subject));
    } else {
      selected = all.filter((e) => ALWAYS_ELIGIBLE.has(e.kind));
    }

    if (request.at) {
      selected = selected.filter((e) => e.recordedAt <= request.at);
    }

    const ordered = [...selected].sort((a, b) => {
      const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      if (byKind !== 0) return byKind;
      if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    return { entries: ordered };
  }
}
