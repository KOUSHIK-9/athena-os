import { describe, expect, it } from 'vitest';
import type { MemoryEntry } from '@athena-os/core';
import { InMemoryStore } from './store.js';
import { DeterministicRetriever } from './reference.js';
import type { RetrievalRequest } from './contract.js';

/**
 * RFC-0013 / 0014 / 0015 / 0016 — Memory conformance suite.
 *
 * Each block maps to the explicit "Conformance" checklist in the corresponding
 * RFC. RFC-0015 §10 projection to a *soft* constraint and RFC-0016 §9 trigger
 * *firing* live behind the reasoning/execution seam; those are covered by
 * `servers/mcp-server/src/run/{memory.integration,memoryContext,triggers}.test.ts`.
 * This file certifies the memory *model + retrieval* contract that those tests
 * build on.
 */

const KINDS: MemoryEntry['kind'][] = ['fact', 'preference', 'experience', 'trigger'];

function entry(
  id: string,
  subject: string,
  kind: MemoryEntry['kind'],
  recordedAt: string,
  payload: unknown = null
): MemoryEntry {
  return { id, kind, subject, recordedAt, payload };
}

const baseRequest: RetrievalRequest = { intentKind: 'travel', requested: [] };

// ---------------------------------------------------------------------------
// RFC-0013 §Conformance — the model
// ---------------------------------------------------------------------------

describe('RFC-0013 Memory model conformance', () => {
  it('round-trips a recorded entry losslessly (record → replay is equal)', () => {
    const store = new InMemoryStore('s1');
    const e = entry('f1', 'user.homeAirport', 'fact', '2026-01-01T00:00:00Z', {
      value: 'SFO',
    });
    store.record(e);
    const read = store.entries().find((x) => x.id === 'f1');
    expect(read).toEqual(e);
  });

  it('classifies every entry into exactly one kind (no dual-typed entries)', () => {
    const store = new InMemoryStore();
    for (const k of KINDS) {
      store.record(entry(`${k}1`, `${k}.subject`, k, '2026-01-01T00:00:00Z'));
    }
    const all = store.entries();
    expect(all).toHaveLength(4);
    for (const e of all) expect(KINDS).toContain(e.kind);
  });

  it('applies supersession deterministically: same subject, later recordedAt wins', () => {
    const store = new InMemoryStore();
    store.record(entry('old', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z'));
    store.record(entry('new', 'user.preferredSeat', 'preference', '2026-02-01T00:00:00Z'));
    const read = store.entries();
    expect(read).toHaveLength(1);
    expect(read[0].id).toBe('new');
  });

  it('breaks supersession ties by id: the lexicographically greater id wins', () => {
    const store = new InMemoryStore();
    store.record(entry('b', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    store.record(entry('a', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    const read = store.entries();
    expect(read).toHaveLength(1);
    // Greater id is treated as newer — this is what lets appended trigger
    // state-transition suffixes (e.g. `-fired`, `-satisfied`) reliably
    // supersede the prior entry (RFC-0013 §5).
    expect(read[0].id).toBe('b');
  });

  it('retains superseded entries append-only (excluded from reads, not deleted)', () => {
    const store = new InMemoryStore();
    store.record(entry('old', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    store.record(entry('new', 'user.language', 'fact', '2026-02-01T00:00:00Z'));
    // Reads expose only the newest; the older entry is retained (not overwritten).
    expect(store.entries().map((e) => e.id)).toEqual(['new']);
    expect(store.entries('user.language').map((e) => e.id)).toEqual(['new']);
  });

  it('a trigger entry always carries a valid lifecycle state', () => {
    const valid = ['pending', 'fired', 're-armed', 'satisfied', 'cancelled'] as const;
    const store = new InMemoryStore();
    for (const state of valid) {
      store.record(
        entry(`t-${state}`, 'travel.standup', 'trigger', '2026-01-01T00:00:00Z', { state })
      );
    }
    for (const e of store.entries()) {
      const s = (e.payload as { state: string }).state;
      expect(valid).toContain(s);
    }
  });

  it('empty memory changes nothing: retriever returns [] and never invents entries', () => {
    const res = new DeterministicRetriever().retrieve(baseRequest, new InMemoryStore());
    expect(res.entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RFC-0014 §4 / §1 — retrieval contract
// ---------------------------------------------------------------------------

describe('RFC-0014 Memory retrieval conformance', () => {
  it('is deterministic: identical store + request → identical order', () => {
    const store = new InMemoryStore();
    store.record(entry('f1', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    store.record(entry('p1', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z'));
    const r = new DeterministicRetriever();
    expect(r.retrieve(baseRequest, store).entries.map((e) => e.id)).toEqual(
      r.retrieve(baseRequest, store).entries.map((e) => e.id)
    );
  });

  it('orders by kind: fact, preference, experience, trigger', () => {
    const store = new InMemoryStore();
    store.record(entry('t1', 'travel.flightTomorrow', 'trigger', '2026-01-01T00:00:00Z'));
    store.record(entry('x1', 'travel.lastFlight', 'experience', '2026-01-01T00:00:00Z'));
    store.record(entry('p1', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z'));
    store.record(entry('f1', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    const res = new DeterministicRetriever().retrieve(
      {
        intentKind: 'travel',
        requested: ['user.language', 'user.preferredSeat', 'travel.lastFlight', 'travel.flightTomorrow'],
      },
      store
    );
    expect(res.entries.map((e) => e.id)).toEqual(['f1', 'p1', 'x1', 't1']);
  });

  it('never returns trigger entries unless explicitly requested (RFC-0014 §1 scoping)', () => {
    const store = new InMemoryStore();
    store.record(entry('t1', 'travel.flightTomorrow', 'trigger', '2026-01-01T00:00:00Z'));
    store.record(entry('f1', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    const r = new DeterministicRetriever();
    expect(r.retrieve(baseRequest, store).entries.map((e) => e.id)).toEqual(['f1']);
    expect(
      r.retrieve({ ...baseRequest, requested: ['travel.flightTomorrow'] }, store).entries.map(
        (e) => e.id
      )
    ).toEqual(['t1']);
  });

  it('subject faithfulness: only requested subjects are returned', () => {
    const store = new InMemoryStore();
    store.record(entry('f1', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    store.record(entry('p1', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z'));
    const res = new DeterministicRetriever().retrieve(
      { ...baseRequest, requested: ['user.language'] },
      store
    );
    expect(res.entries.map((e) => e.id)).toEqual(['f1']);
  });
});

// ---------------------------------------------------------------------------
// RFC-0015 §10 — preferences (memory-level; projection is downstream)
// ---------------------------------------------------------------------------

describe('RFC-0015 Preferences conformance (memory level)', () => {
  it('a stored preference retrieves as that entry (always-eligible)', () => {
    const store = new InMemoryStore();
    store.record(entry('p1', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z', 'window'));
    const res = new DeterministicRetriever().retrieve(baseRequest, store).entries;
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe('preference');
    expect(res[0].payload).toBe('window');
  });

  it('supersession returns only the newest preference on a subject (§3)', () => {
    const store = new InMemoryStore();
    store.record(entry('old', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z', 'window'));
    store.record(entry('new', 'user.preferredSeat', 'preference', '2026-02-01T00:00:00Z', 'aisle'));
    const res = new DeterministicRetriever().retrieve(baseRequest, store).entries;
    expect(res).toHaveLength(1);
    expect(res[0].payload).toBe('aisle');
  });

  it('projection is downstream: retrieval returns raw entries, never soft constraints', () => {
    const store = new InMemoryStore();
    store.record(entry('p1', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z', 'window'));
    const res = new DeterministicRetriever().retrieve(baseRequest, store);
    // A retriever must not invent constraint objects; it returns the MemoryEntry as-is.
    expect(res.entries[0]).toEqual(
      entry('p1', 'user.preferredSeat', 'preference', '2026-01-01T00:00:00Z', 'window')
    );
  });
});

// ---------------------------------------------------------------------------
// RFC-0016 §9 — triggers (memory level; firing lifecycle in mcp-server)
// ---------------------------------------------------------------------------

describe('RFC-0016 Triggers conformance (memory level)', () => {
  it('a trigger entry is a valid MemoryEntry of kind trigger', () => {
    const store = new InMemoryStore();
    store.record(
      entry('t1', 'schedule.standup', 'trigger', '2026-01-01T00:00:00Z', {
        state: 'pending',
        recurrence: 'once',
      })
    );
    const t = store.entries().find((e) => e.kind === 'trigger');
    expect(t?.kind).toBe('trigger');
    expect((t?.payload as { state: string }).state).toBe('pending');
  });

  it('is excluded from always-eligible retrieval and only returned when requested (§7)', () => {
    const store = new InMemoryStore();
    store.record(entry('f1', 'user.language', 'fact', '2026-01-01T00:00:00Z'));
    store.record(
      entry('t1', 'schedule.standup', 'trigger', '2026-01-01T00:00:00Z', { state: 'pending' })
    );
    const r = new DeterministicRetriever();
    expect(r.retrieve(baseRequest, store).entries.map((e) => e.id)).toEqual(['f1']);
    expect(
      r.retrieve({ ...baseRequest, requested: ['schedule.standup'] }, store).entries.map(
        (e) => e.id
      )
    ).toEqual(['t1']);
  });
});
