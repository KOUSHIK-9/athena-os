import { describe, expect, it } from 'vitest';
import type { CapabilityRegistry } from '@athena-os/core';
import { DeterministicReasoningEngine } from '../src/index.js';

const registry: CapabilityRegistry = {
  capabilities: () => [
    {
      id: 'messages-send',
      description: 'Send a message',
      goalKinds: ['sendMessage'],
    },
  ],
};

describe('Scenario: guarded messaging (safety constraints)', () => {
  it('rejects a plan when a safety constraint forbids the goal', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason({
      id: 'intent-guarded-message',
      text: 'reply to Alice',
      goals: [],
      constraints: [
        {
          id: 'policy-alice-block',
          kind: 'forbid',
          goalKind: 'sendMessage',
          target: 'Alice',
          category: 'safety',
          reason: 'Alice is on the restricted contact list',
        },
      ],
    });

    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reasons[0]).toContain('restricted contact list');
  });

  it('allows the same intent when the constraint targets someone else', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason({
      id: 'intent-guarded-message',
      text: 'reply to Alice',
      goals: [],
      constraints: [
        {
          id: 'policy-bob-block',
          kind: 'forbid',
          goalKind: 'sendMessage',
          target: 'Bob',
          category: 'safety',
          reason: 'Bob is on the restricted contact list',
        },
      ],
    });

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;
    expect(result.plan.steps[0].capabilityId).toBe('messages-send');
  });

  it('produces a plan when no constraints apply', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason({
      id: 'intent-guarded-message',
      text: 'reply to Alice',
      goals: [],
      constraints: [],
    });

    expect(result.kind).toBe('executionPlan');
  });
});