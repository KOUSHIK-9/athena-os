import { describe, expect, it } from 'vitest';
import type { MemoryEntry } from '@athena-os/core';
import { InMemoryStore } from './store.js';

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
