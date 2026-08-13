import type { Intent, MemoryEntry } from '@athena-os/core';
import type { RetrievalResponse } from './contract.js';

/**
 * The assembled retrieval result. Per RFC-0014 §2, this is the persistent memory
 * portion of the session Context (RFC-0005 §4) — the engine merges `entries`
 * into the Context it supplies to the backend. It is NOT the RFC-0005 §4 Context
 * itself.
 */
export interface RetrievalResult {
  readonly intent: Intent;
  readonly entries: readonly MemoryEntry[];
}

export function assembleContext(intent: Intent, response: RetrievalResponse): RetrievalResult {
  return { intent, entries: response.entries };
}
