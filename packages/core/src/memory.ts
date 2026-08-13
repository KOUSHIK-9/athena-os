/**
 * RFC-0013 Memory model types.
 *
 * The Memory *model* types belong in @athena-os/core (one concept, one canonical
 * definition), exactly as Intent and Constraint do (RFC-0013 §The Contract and
 * §266). The retrieval contract types (RetrievalRequest / RetrievalResponse /
 * MemoryRetriever) live in the `packages/memory` implementation, per RFC-0014 §6.
 */

export type MemoryKind = 'fact' | 'preference' | 'experience' | 'trigger';

export interface MemoryEntry {
  readonly id: string; // stable, protocol-scoped
  readonly kind: MemoryKind;
  readonly subject: string; // canonical dotted identifier, RFC-0013 §5
  readonly recordedAt: string; // ISO-8601
  readonly payload: unknown; // typed per kind
}

/**
 * Read-only seam the retriever reads against (RFC-0013 §The Contract, RFC-0014).
 * The engine hands a memory-aware backend an implementation of this via the
 * `memory?: MemoryReader` handoff; `reason(intent, registry)` is unchanged.
 */
export interface MemoryReader {
  readonly id: string;
  entries(subject?: string): readonly MemoryEntry[];
}

/** Write + read. Recording is append-only; reads apply supersession (RFC-0013 §5). */
export interface MemoryStore extends MemoryReader {
  record(entry: MemoryEntry): void;
}
