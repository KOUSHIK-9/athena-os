import { describe, expect, it, vi } from 'vitest';
import type { MemoryEntry } from '@athena-os/core';
import { InMemoryStore } from '@athena-os/memory';
import { reasonForRun } from './reason.js';
import { runOnDevice } from './execute.js';
import { triggerState, type TriggerPayload, type TriggerRecurrence } from './triggers.js';

vi.mock('../sessionManager.js', () => {
  return {
    mcpSessionManager: {
      getExecutor: () => ({
        execute: () => Promise.resolve({ success: true, duration: 100 }),
        getSession: () => ({ id: 'test-session', deviceUdid: 'test-udid' }),
      }),
      connect: () => Promise.resolve({ sessionId: 'test-session', deviceUdid: 'test-udid' }),
      getActiveSessions: () => [],
    },
  };
});

function makeTrigger(
  subject: string,
  condition: TriggerPayload['condition'],
  recurrence: TriggerRecurrence,
  actionText: string
): MemoryEntry {
  return {
    id: `trig-${subject}`,
    kind: 'trigger',
    subject,
    recordedAt: '2026-01-01T00:00:00.000Z',
    payload: { condition, action: { text: actionText }, recurrence, state: 'pending' } satisfies TriggerPayload,
  };
}

describe('Memory product loop: trigger firing + experience write-back (RFC-0016/0013)', () => {
  it('fires a due trigger through the run lifecycle and records a successful experience', async () => {
    const store = new InMemoryStore();
    // A due, once-only trigger whose synthesized intent is a normal plan.
    store.record(makeTrigger('schedule.standup', { kind: 'always' }, 'once', 'Open Settings'));

    const outcome = await runOnDevice(
      { prompt: 'Open Settings', backend: 'deterministic', memory: store },
      reasonForRun
    );

    // Main run succeeded on the mocked device.
    expect(outcome.success).toBe(true);

    // The due trigger was fired by the run lifecycle and, because its
    // synthesized intent produced a valid plan, advanced to satisfied.
    const trigger = store.entries().filter((e) => e.kind === 'trigger' && e.subject === 'schedule.standup');
    expect(trigger).toHaveLength(1);
    expect(triggerState(trigger[0])).toBe('satisfied');

    // The verified-successful execution was written back as an experience.
    const experiences = store.entries().filter((e) => e.kind === 'experience');
    expect(experiences).toHaveLength(1);
    expect((experiences[0].payload as { success: boolean }).success).toBe(true);
  });

  it('does not fire triggers or write experiences when no memory store is supplied', async () => {
    const outcome = await runOnDevice({ prompt: 'Open Settings', backend: 'deterministic' }, reasonForRun);
    expect(outcome.success).toBe(true);
  });
});
