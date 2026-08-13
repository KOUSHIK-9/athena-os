import type { MemoryEntry, MemoryStore } from '@athena-os/core';

/** Supersession (RFC-0013 §5): later recordedAt wins; ties broken by id ascending. */
function isNewer(a: MemoryEntry, b: MemoryEntry): boolean {
  if (a.recordedAt !== b.recordedAt) return a.recordedAt > b.recordedAt;
  return a.id > b.id;
}

/**
 * Append-only in-memory store (RFC-0013 §5). Recording never mutates an entry; a
 * newer entry on the same subject deterministically supersedes the older one,
 * which is retained but excluded from reads.
 */
export class InMemoryStore implements MemoryStore {
  readonly id: string;
  private readonly all: MemoryEntry[] = [];

  constructor(id = 'memory:inMemory') {
    this.id = id;
  }

  record(entry: MemoryEntry): void {
    this.all.push(entry);
  }

  entries(subject?: string): readonly MemoryEntry[] {
    const scoped = subject ? this.all.filter((e) => e.subject === subject) : this.all;
    const newest = new Map<string, MemoryEntry>();
    for (const e of scoped) {
      const cur = newest.get(e.subject);
      if (!cur || isNewer(e, cur)) newest.set(e.subject, e);
    }
    return [...newest.values()];
  }
}
