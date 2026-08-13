import type { ExecutionPlan, Intent, MemoryEntry, MemoryStore } from '@athena-os/core';

/**
 * RFC-0016 trigger firing on the execution side.
 *
 * Triggers are ordinary `MemoryEntry` rows of `kind: 'trigger'` (RFC-0013 §3);
 * this module owns only the evaluation/lifecycle mechanics RFC-0016 delegates
 * here. There is exactly ONE trigger model — the MemoryEntry — and the store's
 * append-only + supersession rule (RFC-0013 §5) is what advances a trigger
 * through its states: each transition writes a new entry sharing the trigger's
 * subject, and the store exposes the newest one.
 *
 * Lifecycle (RFC-0016 §2):
 *
 *   pending ──(fires)──▶ fired ──(satisfied)──▶ (done)
 *                        ├──(recurring)──▶ re-armed ──▶ pending
 *                        └──(cancelled)──▶ (done)
 */

export type TriggerState = 'pending' | 'fired' | 'satisfied' | 're-armed' | 'cancelled';

export type TriggerConditionKind = 'time' | 'always';

export interface TriggerCondition {
  /** `time`: fires once `now >= at`. `always`: fires on every evaluation. */
  kind: TriggerConditionKind;
  /** ISO-8601 timestamp; required for `kind: 'time'`. */
  at?: string;
}

export type TriggerRecurrence = 'once' | 'daily' | 'weekly';

/** Typed payload carried by a `trigger` MemoryEntry (RFC-0013 §3 / RFC-0016 §1). */
export interface TriggerPayload {
  condition: TriggerCondition;
  /** The intent template synthesized when the trigger fires (RFC-0016 §4). */
  action: { text: string; backend?: string };
  recurrence: TriggerRecurrence;
  state: TriggerState;
  firedAt?: string;
  lastSatisfiedAt?: string;
}

export interface TriggerRecord {
  entry: MemoryEntry;
  payload: TriggerPayload;
}

/** Narrow a store entry to a typed trigger, or null if it is not one. */
export function asTrigger(entry: MemoryEntry): TriggerRecord | null {
  if (entry.kind !== 'trigger') return null;
  return { entry, payload: entry.payload as TriggerPayload };
}

export function triggerState(entry: MemoryEntry): TriggerState {
  return (entry.payload as TriggerPayload).state;
}

/** All trigger entries currently in the store (newest per subject). */
export function readTriggers(store: MemoryStore): MemoryEntry[] {
  return store.entries().filter((e) => e.kind === 'trigger');
}

export function readPendingTriggers(store: MemoryStore): MemoryEntry[] {
  return readTriggers(store).filter((e) => triggerState(e) === 'pending');
}

/** Pure condition evaluation against observed `now` (RFC-0016 §4, read-only). */
export function isConditionMet(condition: TriggerCondition, now: string): boolean {
  if (condition.kind === 'always') return true;
  if (condition.kind === 'time') {
    if (!condition.at) return false;
    return new Date(now).getTime() >= new Date(condition.at).getTime();
  }
  return false;
}

/** Compute the next occurrence timestamp for a recurring trigger (RFC-0016 §3). */
export function nextOccurrence(fromIso: string, recurrence: TriggerRecurrence): string {
  const date = new Date(fromIso);
  if (recurrence === 'daily') date.setDate(date.getDate() + 1);
  else if (recurrence === 'weekly') date.setDate(date.getDate() + 7);
  else return fromIso;
  return date.toISOString();
}

/**
 * Write a new trigger entry that supersedes `base` (same subject, newer
 * `recordedAt`). The store keeps both but exposes only the newest, which is how
 * a trigger "advances" state. `stateSuffix` makes the new id sort after the
 * prior one so ties on `recordedAt` resolve to the latest transition.
 */
function writeTrigger(
  store: MemoryStore,
  base: MemoryEntry,
  payload: TriggerPayload,
  now: string,
  stateSuffix: string
): MemoryEntry {
  const entry: MemoryEntry = {
    id: `${base.id}-${stateSuffix}`,
    kind: 'trigger',
    subject: base.subject,
    recordedAt: now,
    payload,
  };
  store.record(entry);
  return entry;
}

/** pending → fired. Idempotent guard: only fires while still pending. */
export function fireTrigger(store: MemoryStore, entry: MemoryEntry, now: string): MemoryEntry {
  if (triggerState(entry) !== 'pending') return entry;
  const payload = entry.payload as TriggerPayload;
  return writeTrigger(store, entry, { ...payload, state: 'fired', firedAt: now }, now, 'fired');
}

/** fired → cancelled. Allowed from pending or fired per RFC-0016 §5. */
export function cancelTrigger(store: MemoryStore, entry: MemoryEntry, now: string): MemoryEntry {
  const payload = entry.payload as TriggerPayload;
  return writeTrigger(store, entry, { ...payload, state: 'cancelled' }, now, 'cancelled');
}

/**
 * Advance a fired trigger after its synthesized intent has executed.
 * - `once` + success → satisfied (terminal).
 * - recurring + success → re-armed → pending (next occurrence computed).
 * - failure → stays `fired` (RFC-0016 §6: tied to actual execution outcome).
 */
export function completeTrigger(
  store: MemoryStore,
  entry: MemoryEntry,
  success: boolean,
  now: string
): MemoryEntry {
  const payload = entry.payload as TriggerPayload;
  if (triggerState(entry) !== 'fired') return entry;
  if (!success) return entry;

  if (payload.recurrence === 'once') {
    return writeTrigger(
      store,
      entry,
      { ...payload, state: 'satisfied', lastSatisfiedAt: now },
      now,
      'satisfied'
    );
  }

  // Recurring: fired → re-armed → pending (next occurrence). The `pending`
  // write is stamped one millisecond later so it is unambiguously the newest
  // entry under supersession (same subject, equal recordedAt would otherwise
  // tie-break on id, and 're-armed' sorts after 'pending').
  writeTrigger(store, entry, { ...payload, state: 're-armed' }, now, 're-armed');
  const nextAt = nextOccurrence(payload.firedAt ?? now, payload.recurrence);
  const pendingAt = new Date(new Date(now).getTime() + 1).toISOString();
  return writeTrigger(
    store,
    entry,
    { ...payload, state: 'pending', condition: { ...payload.condition, at: nextAt } },
    pendingAt,
    'pending'
  );
}

/** The synthesized intent text a fired trigger produces (RFC-0016 §4). */
export function synthesizeIntent(entry: MemoryEntry): string {
  return (entry.payload as TriggerPayload).action.text;
}

export interface TriggerRunOutcome {
  triggerId: string;
  subject: string;
  fired: boolean;
  /** Result of the synthesized intent's execution through the pipeline. */
  outcome: 'satisfied' | 're-armed' | 'failed' | 'skipped';
}

/**
 * Fire and execute every due `pending` trigger (RFC-0016 §4).
 *
 * Evaluation is read-only against state: we only read `now` and the trigger
 * condition. Firing writes `fired`, synthesizes an Intent, routes it through
 * `reason` (the normal RFC-0009 pipeline), and then advances the trigger based
 * on whether a valid plan resulted. `reason` is injected so callers can bind
 * memory/backend and so this stays hermetic in tests.
 */
export async function runDueTriggers(
  store: MemoryStore,
  opts: {
    reason: (prompt: string) => Promise<{ result: { kind: string } }> | { result: { kind: string } };
    now?: string;
  }
): Promise<TriggerRunOutcome[]> {
  const now = opts.now ?? new Date().toISOString();
  const due = readPendingTriggers(store).filter((e) =>
    isConditionMet((e.payload as TriggerPayload).condition, now)
  );

  const outcomes: TriggerRunOutcome[] = [];
  for (const entry of due) {
    const fired = fireTrigger(store, entry, now);
    const prompt = synthesizeIntent(entry);
    const result = await opts.reason(prompt);
    const success = result.result.kind === 'executionPlan';
    const finalEntry = completeTrigger(store, fired, success, now);
    const state = triggerState(finalEntry);
    outcomes.push({
      triggerId: entry.id,
      subject: entry.subject,
      fired: true,
      outcome: !success ? 'failed' : state === 'satisfied' ? 'satisfied' : 're-armed',
    });
  }
  return outcomes;
}

export interface ExperienceInput {
  intent: Intent;
  plan: ExecutionPlan;
  backendId: string;
  /** Only successful executions may be recorded — see guard below. */
  success: boolean;
  executedStepCount?: number;
}

/**
 * RFC-0013/0016 session-scoped memory write-back: record a successful execution
 * as an `experience` MemoryEntry so future reasoning can learn from it.
 *
 * Guard: a failed or ambiguous execution must NEVER become a false "successful"
 * memory. If `success` is false this returns null and writes nothing — callers
 * must also only invoke it on the verified-success path, but the guard is the
 * second line of defense against corrupting memory with failures.
 */
export function recordExperience(store: MemoryStore, input: ExperienceInput): MemoryEntry | null {
  if (!input.success) return null;
  const recordedAt = new Date().toISOString();
  const entry: MemoryEntry = {
    id: `exp-${input.intent.id}-${recordedAt}`,
    kind: 'experience',
    subject: `experience.${input.intent.id}`,
    recordedAt,
    payload: {
      prompt: input.intent.text,
      backendId: input.backendId,
      goalKinds: input.plan.steps.map((s) => s.goalId),
      executedStepCount: input.executedStepCount ?? input.plan.steps.length,
      success: true,
    },
  };
  store.record(entry);
  return entry;
}
