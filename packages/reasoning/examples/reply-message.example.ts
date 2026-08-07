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

describe('Scenario: Reply to a message (verb lexicon path)', () => {
  it('turns "reply to Alice" into a sendMessage plan', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason({
      id: 'intent-reply-message',
      text: 'reply to Alice',
      goals: [],
      constraints: [],
    });

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].capabilityId).toBe('messages-send');
  });

  it('extracts the target as the goal target (Alice)', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason({
      id: 'intent-reply-message',
      text: 'reply to Alice',
      goals: [],
      constraints: [],
    });

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    const plan = result.plan;
    expect(plan.steps[0].goalId).toBe('goal-1');
  });
});