import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { MemoryEntry, MemoryStore } from '@athena-os/core';

/** Supersession (RFC-0013 §5): later recordedAt wins; ties broken by id ascending. */
function isNewer(a: MemoryEntry, b: MemoryEntry): boolean {
  if (a.recordedAt !== b.recordedAt) return a.recordedAt > b.recordedAt;
  return a.id > b.id;
}

/** Default on-disk location for the persistent RFC-0013 memory store. */
export function defaultMemoryPath(): string {
  return join(homedir(), '.athena', 'memory.json');
}

function isMemoryEntry(value: unknown): value is MemoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.kind === 'string' &&
    typeof e.subject === 'string' &&
    typeof e.recordedAt === 'string'
  );
}

/**
 * Disk-backed append-only store (RFC-0013 §5). Entries are persisted as JSON so
 * they survive process restarts — this is what lets a later `athena run` retrieve
 * a preference recorded by an earlier command (the CLI spawns a fresh MCP server
 * per invocation, so in-process memory alone would never persist across runs).
 * Reads apply supersession: only the newest entry per subject is returned.
 */
export class FileMemoryStore implements MemoryStore {
  readonly id: string;
  private readonly path: string;
  private all: MemoryEntry[] = [];

  constructor(path: string = defaultMemoryPath(), id?: string) {
    this.path = path;
    this.id = id ?? `memory:file:${path}`;
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.path)) {
        const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as { entries?: unknown };
        if (Array.isArray(parsed.entries)) {
          this.all = parsed.entries.filter(isMemoryEntry);
        }
      }
    } catch {
      this.all = [];
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify({ entries: this.all }, null, 2), 'utf8');
  }

  record(entry: MemoryEntry): void {
    const toStore: MemoryEntry = entry.id ? entry : { ...entry, id: randomUUID() };
    this.all.push(toStore);
    this.persist();
  }

  /** Remove every entry and rewrite an empty store. */
  clear(): void {
    this.all = [];
    this.persist();
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
