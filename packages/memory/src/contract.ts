import type { MemoryEntry, MemoryReader } from '@athena-os/core';

export interface RetrievalRequest {
  readonly intentKind: string; // what the plan will do ("communication", "travel", …)
  readonly requested: string[]; // canonical subjects the session needs (RFC-0013 §5)
  readonly at?: string; // ISO-8601 snapshot; default: now
}

export interface RetrievalResponse {
  readonly entries: readonly MemoryEntry[]; // strict total order, no duplicate subjects
}

export interface MemoryRetriever {
  readonly id: string; // e.g. "memory:deterministic"
  retrieve(request: RetrievalRequest, memory: MemoryReader): RetrievalResponse;
}
