import { describe, expect, it } from 'vitest';
import type { MemoryEntry } from '@athena-os/core';
import { InMemoryStore } from '@athena-os/memory';
import {
  asTrigger,
  cancelTrigger,
  completeTrigger,
  fireTrigger,
  isConditionMet,
  nextOccurrence,
  readPendingTriggers,
  recordExperience,
  runDueTriggers,
  synthesizeIntent,
  triggerState,
  type TriggerPayload,
  type TriggerRecurrence,
} from './triggers.js';

function makeTrigger(
  subject: string,
  condition: TriggerPayload['condition'],
  recurrence: TriggerRecurrence = 'once',
  state: TriggerPayload['state'] = 'pending'
): MemoryEntry {
  return {
    id: `trig-${subject}`,
    kind: 'trigger',
    subject,
    recordedAt: '2026-01-01T00:00:00.000Z',
    payload: {
      condition,
      action: { text: `do ${subject}` },
      recurrence,
      state,
    } satisfies TriggerPayload,
  };
}

function triggerAt(store: InMemoryStore, subject: string): MemoryEntry {
  const found = store.entries().filter((e) => e.kind === 'trigger' && e.subject === subject);
  expect(found.length).toBeGreaterThan(0);
  return found[found.length - 1];
}

describe('RFC-0016 trigger lifecycle', () => {
  it('does not fire a pending time trigger before its at timestamp', () => {
    expect(isConditionMet({ kind: 'time', at: '2026-06-01T00:00:00.000Z' }, '2026-01-01T00:00:00.000Z')).toBe(false);
    expect(isConditionMet({ kind: 'always' }, '2026-01-01T00:00:00.000Z')).toBe(true);
  });

  it('fires pending → fired and records firedAt', () => {
    const store = new InMemoryStore();
    store.record(makeTrigger('schedule.standup', { kind: 'time', at: '2026-01-01T00:00:00.000Z' }));
    const now = '2026-02-01T00:00:00.000Z';
    const fired = fireTrigger(store, triggerAt(store, 'schedule.standup'), now);
    expect(triggerState(fired)).toBe('fired');
    expect((fired.payload as TriggerPayload).firedAt).toBe(now);
  });

  it('never re-fires a non-pending trigger', () => {
    const store = new InMemoryStore();
    const base = makeTrigger('t1', { kind: 'always' }, 'once', 'fired');
    store.record(base);
    const again = fireTrigger(store, store.entries()[0], '2026-02-01T00:00:00.000Z');
    expect(triggerState(again)).toBe('fired');
  });

  it('satisfies a once trigger on successful execution', () => {
    const store = new InMemoryStore();
    store.record(makeTrigger('t1', { kind: 'always' }, 'once'));
    const fired = fireTrigger(store, triggerAt(store, 't1'), '2026-02-01T00:00:00.000Z');
    const done = completeTrigger(store, fired, true, '2026-02-01T00:00:05.000Z');
    expect(triggerState(done)).toBe('satisfied');
    expect((done.payload as TriggerPayload).lastSatisfiedAt).toBe('2026-02-01T00:00:05.000Z');
  });

  it('keeps a once trigger fired when its execution failed', () => {
    const store = new InMemoryStore();
    store.record(makeTrigger('t1', { kind: 'always' }, 'once'));
    const fired = fireTrigger(store, triggerAt(store, 't1'), '2026-02-01T00:00:00.000Z');
    const stillFired = completeTrigger(store, fired, false, '2026-02-01T00:00:05.000Z');
    expect(triggerState(stillFired)).toBe('fired');
  });

  it('re-arms and re-pends a recurring trigger with the next occurrence', () => {
    const store = new InMemoryStore();
    store.record(makeTrigger('t.daily', { kind: 'always' }, 'daily'));
    const firedAt = '2026-02-01T00:00:00.000Z';
    const fired = fireTrigger(store, triggerAt(store, 't.daily'), firedAt);
    const rearmed = completeTrigger(store, fired, true, firedAt);
    // The durable, newest visible state returns to `pending` (re-armed is a
    // transient transition write, superseded by the pending entry).
    expect(triggerState(rearmed)).toBe('pending');
    const cond = (rearmed.payload as TriggerPayload).condition;
    expect(cond.at).toBe(nextOccurrence(firedAt, 'daily'));
  });

  it('cancels a pending or fired trigger', () => {
    const store = new InMemoryStore();
    store.record(makeTrigger('t1', { kind: 'always' }, 'once'));
    const cancelled = cancelTrigger(store, triggerAt(store, 't1'), '2026-02-01T00:00:00.000Z');
    expect(triggerState(cancelled)).toBe('cancelled');
  });

  it('runDueTriggers fires due triggers and advances their state via the pipeline', async () => {
    const store = new InMemoryStore();
    store.record(makeTrigger('t.once', { kind: 'always' }, 'once'));
    store.record(makeTrigger('t.daily', { kind: 'always' }, 'daily'));
    const reason = async () => ({ result: { kind: 'executionPlan' as const } });

    const outcomes = await runDueTriggers(store, { reason, now: '2026-03-01T00:00:00.000Z' });

    expect(outcomes.map((o) => o.subject).sort()).toEqual(['t.daily', 't.once']);
    expect(triggerState(triggerAt(store, 't.once'))).toBe('satisfied');
    expect(triggerState(triggerAt(store, 't.daily'))).toBe('pending');
  });

  it('runDueTriggers leaves a trigger fired when the pipeline yields no plan', async () => {
    const store = new InMemoryStore();
    store.record(makeTrigger('t1', { kind: 'always' }, 'once'));
    const reason = async () => ({ result: { kind: 'clarificationRequired' as const } });
    await runDueTriggers(store, { reason, now: '2026-03-01T00:00:00.000Z' });
    expect(triggerState(triggerAt(store, 't1'))).toBe('fired');
  });

  it('runDueTriggers does not fire triggers whose condition is not yet met', async () => {
    const store = new InMemoryStore();
    store.record(makeTrigger('t1', { kind: 'time', at: '2099-01-01T00:00:00.000Z' }, 'once'));
    const reason = async () => ({ result: { kind: 'executionPlan' as const } });
    const outcomes = await runDueTriggers(store, { reason, now: '2026-03-01T00:00:00.000Z' });
    expect(outcomes).toHaveLength(0);
  });

  it('synthesizeIntent returns the action template text', () => {
    const t = makeTrigger('t1', { kind: 'always' });
    expect(synthesizeIntent(t)).toBe('do t1');
    expect(asTrigger(t)?.payload.state).toBe('pending');
  });
});

describe('RFC-0013/0016 experience write-back', () => {
  it('writes an experience entry on success', () => {
    const store = new InMemoryStore();
    const experience = recordExperience(store, {
      intent: { id: 'intent-1', text: 'Open Settings', goals: [], constraints: [] },
      plan: { id: 'plan-1', intentId: 'intent-1', steps: [] },
      backendId: 'deterministic',
      success: true,
      executedStepCount: 3,
    });
    expect(experience).not.toBeNull();
    expect(experience!.kind).toBe('experience');
    const stored = store.entries().find((e) => e.kind === 'experience');
    expect(stored).toBeDefined();
    expect((stored!.payload as { success: boolean }).success).toBe(true);
  });

  it('never writes a false-success experience for a failed run', () => {
    const store = new InMemoryStore();
    const experience = recordExperience(store, {
      intent: { id: 'intent-2', text: 'Open Settings', goals: [], constraints: [] },
      plan: { id: 'plan-2', intentId: 'intent-2', steps: [] },
      backendId: 'deterministic',
      success: false,
    });
    expect(experience).toBeNull();
    expect(store.entries().filter((e) => e.kind === 'experience')).toHaveLength(0);
  });
});
