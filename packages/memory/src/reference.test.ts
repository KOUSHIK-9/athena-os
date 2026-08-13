import { describe, expect, it } from 'vitest';
import type { MemoryEntry } from '@athena-os/core';
import { InMemoryStore } from './store.js';
import { DeterministicRetriever } from './reference.js';
import type { RetrievalRequest } from './contract.js';

function entry(
  id: string,
  subject: string,
  kind: MemoryEntry['kind'],
  recordedAt: string
): MemoryEntry {
  return { id, kind, subject, recordedAt, payload: null };
}

const baseRequest: RetrievalRequest = { intentKind: 'travel', requested: [] };

describe('DeterministicRetriever (RFC-0014 §4 conformance)', () => {
  it('returns [] on an empty store — Memory never invents entries', () => {
    const retriever = new DeterministicRetriever();
    const res = retriever.retrieve(baseRequest, new InMemoryStore());
    expect(res.entries).toEqual([]);
  });

  it('is deterministic: same store + same request → byte-identical entries', () => {
    const store = new InMemoryStore();
    store.record(entry('f1', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    store.record(entry('p1', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z'));
    const retriever = new DeterministicRetriever();

    const a = retriever.retrieve(baseRequest, store).entries;
    const b = retriever.retrieve(baseRequest, store).entries;
    expect(a).toEqual(b);
    expect(a.map((e) => e.id)).toEqual(['f1', 'p1']);
  });

  it('honors supersession: only the newest copy of a subject is returned', () => {
    const store = new InMemoryStore();
    store.record(entry('old', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z'));
    store.record(entry('new', 'user.preferredSeat', 'preference', '2026-02-01T00:00:00Z'));
    const retriever = new DeterministicRetriever();

    const res = retriever.retrieve(baseRequest, store).entries;
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('new');
  });

  it('subject faithfulness: only requested subjects are returned', () => {
    const store = new InMemoryStore();
    store.record(entry('f1', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    store.record(entry('p1', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z'));
    const retriever = new DeterministicRetriever();

    const res = retriever.retrieve({ ...baseRequest, requested: ['user.language'] }, store).entries;
    expect(res.map((e) => e.id)).toEqual(['f1']);
  });

  it('orders by kind: fact, preference, experience, trigger', () => {
    const store = new InMemoryStore();
    store.record(entry('t1', 'travel.flightTomorrow', 'trigger', '2026-01-01T00:00:00Z'));
    store.record(entry('x1', 'travel.lastFlight', 'experience', '2026-01-01T00:00:00Z'));
    store.record(entry('p1', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z'));
    store.record(entry('f1', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    const retriever = new DeterministicRetriever();

    // experience/trigger are not in the always-eligible set, so request them.
    const res = retriever.retrieve(
      { intentKind: 'travel', requested: ['user.language', 'user.preferredSeat', 'travel.lastFlight', 'travel.flightTomorrow'] },
      store
    ).entries;
    expect(res.map((e) => e.id)).toEqual(['f1', 'p1', 'x1', 't1']);
  });

  it('never returns trigger entries unless explicitly requested (RFC-0014 §1 scoping)', () => {
    const store = new InMemoryStore();
    store.record(entry('t1', 'travel.flightTomorrow', 'trigger', '2026-01-01T00:00:00Z'));
    store.record(entry('f1', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    const retriever = new DeterministicRetriever();

    const alwaysEligible = retriever.retrieve(baseRequest, store).entries;
    expect(alwaysEligible.map((e) => e.id)).toEqual(['f1']);

    const explicit = retriever.retrieve({ ...baseRequest, requested: ['travel.flightTomorrow'] }, store).entries;
    expect(explicit.map((e) => e.id)).toEqual(['t1']);
  });
});
