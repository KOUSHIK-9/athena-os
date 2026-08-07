import { describe, expect, it } from 'vitest';
import type { CapabilityRegistry } from '@athena-os/core';
import { DeterministicReasoningEngine } from '../src/index.js';

const registry: CapabilityRegistry = {
  capabilities: () => [
    {
      id: 'photos-manage',
      description: 'Manage photo library',
      goalKinds: ['cleanPhotos', 'connectService'],
    },
  ],
};

describe('Scenario: photo cleanup (multi-goal, ordered plan)', () => {
  it('builds one step per goal in declaration order', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason({
      id: 'intent-photo-cleanup',
      goals: [
        {
          id: 'g1',
          kind: 'connectService',
          description: 'Disconnect the photo service',
        },
        {
          id: 'g2',
          kind: 'cleanPhotos',
          description: 'Delete screenshots older than 30 days',
        },
      ],
      constraints: [],
    });

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.plan.steps).toHaveLength(2);
    expect(result.plan.intentId).toBe('intent-photo-cleanup');
    expect(result.plan.steps[0].capabilityId).toBe('photos-manage');
    expect(result.plan.steps[1].capabilityId).toBe('photos-manage');
  });
});