import { describe, expect, it } from 'vitest';
import type { CapabilityRegistry } from '@athena-os/core';
import { DeterministicReasoningEngine, DeterministicCapabilityMatcher, selectCapabilities } from '../src/index.js';

const registry: CapabilityRegistry = {
  capabilities: () => [
    {
      id: 'launch_app',
      description: 'Launch an application from scratch',
      goalKinds: ['openApp'],
    },
    {
      id: 'activate_existing_app',
      description: 'Activate an already-running application',
      goalKinds: ['openApp'],
    },
  ],
};

describe('Scenario: Open Camera (multiple capability candidates)', () => {
  it('returns both candidate capabilities, then selects the first deterministically', () => {
    const matcher = new DeterministicCapabilityMatcher();
    const goal = { id: 'g1', kind: 'openApp', description: 'Open Camera', target: 'Camera' };

    const matched = matcher.matchGoals([goal], registry);
    expect(matched.goals[0].candidates.map((c) => c.capability.id)).toEqual([
      'launch_app',
      'activate_existing_app',
    ]);

    const selection = selectCapabilities(matched);
    expect(selection.selections[0].capability.id).toBe('launch_app');
  });

  it('builds a validated plan through the whole engine', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason({
      id: 'intent-open-camera',
      text: 'open Camera',
      goals: [],
      constraints: [],
    });

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].capabilityId).toBe('launch_app');
  });
});