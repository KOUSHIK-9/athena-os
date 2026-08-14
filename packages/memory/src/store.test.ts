import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MemoryEntry } from '@athena-os/core';
import { FileMemoryStore, InMemoryStore } from './store.js';

function entry(
  id: string,
  subject: string,
  kind: MemoryEntry['kind'],
  recordedAt: string,
  payload: unknown = null
): MemoryEntry {
  return { id, kind, subject, recordedAt, payload };
}

describe('InMemoryStore (RFC-0013 §5 supersession)', () => {
  it('returns the newest entry per subject (later recordedAt wins)', () => {
    const store = new InMemoryStore();
    store.record(entry('e1', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z', 'window'));
    store.record(entry('e2', 'user.preferredSeat', 'preference', '2026-02-01T00:00:00Z', 'aisle'));

    const found = store.entries('user.preferredSeat');
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('e2');
    expect(found[0].payload).toBe('aisle');
  });

  it('breaks recordedAt ties by id ascending', () => {
    const store = new InMemoryStore();
    store.record(entry('a', 'user.language', 'fact', '2026-01-01T00:00:00Z', 'en'));
    store.record(entry('b', 'user.language', 'fact', '2026-01-01T00:00:00Z', 'fr'));

    expect(store.entries('user.language')[0].id).toBe('b');
  });

  it('keeps distinct subjects independent', () => {
    const store = new InMemoryStore();
    store.record(entry('e1', 'user.language', 'fact', '2026-01-01T00:00:00Z', 'en'));
    store.record(entry('e2', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z', 'window'));

    expect(store.entries()).toHaveLength(2);
    expect(store.entries('user.language')[0].payload).toBe('en');
  });

  it('returns an empty list for an empty store / unknown subject', () => {
    const store = new InMemoryStore();
    expect(store.entries()).toHaveLength(0);
    expect(store.entries('nope')).toHaveLength(0);
  });
});

describe('FileMemoryStore (persistence + supersession)', () => {
  const tmp = join(tmpdir(), `athena-mem-${process.pid}-${Math.random().toString(36).slice(2)}.json`);

  afterAll(() => {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  });

  it('persists recorded entries and reloads them in a fresh instance', () => {
    const a = new FileMemoryStore(tmp);
    a.record(entry('e1', 'user.preferredApp', 'preference', '2026-01-01T00:00:00Z', 'Messages'));
    a.record(entry('e2', 'user.language', 'fact', '2026-01-01T00:00:00Z', 'en'));

    const b = new FileMemoryStore(tmp);
    expect(b.entries()).toHaveLength(2);
    expect(b.entries('user.preferredApp')[0].payload).toBe('Messages');
  });

  it('applies supersession across reloads (newest per subject wins)', () => {
    const a = new FileMemoryStore(tmp);
    a.record(entry('e3', 'user.preferredApp', 'preference', '2026-03-01T00:00:00Z', 'Mail'));
    const b = new FileMemoryStore(tmp);
    expect(b.entries('user.preferredApp')).toHaveLength(1);
    expect(b.entries('user.preferredApp')[0].payload).toBe('Mail');
  });

  it('clear() empties the store on disk', () => {
    const a = new FileMemoryStore(tmp);
    a.clear();
    const b = new FileMemoryStore(tmp);
    expect(b.entries()).toHaveLength(0);
  });
});
