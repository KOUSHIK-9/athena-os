import { describe, expect, it } from 'vitest';
import type { CapabilityRegistry } from '@athena-os/core';
import { DeterministicReasoningEngine } from '../src/index.js';

const registry: CapabilityRegistry = {
  capabilities: () => [
    {
      id: 'messages-send',
      description: 'Send a message',
      goalKinds: ['sendMessage'],
      availability: 'available',
      requiresResources: ['network', 'contacts'],
      reliability: 0.95,
    },
  ],
};

describe('Scenario: message send with a resource-scanning environment', () => {
  it('flags missing resources in the simulation, but still returns a valid plan', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason(
      {
        id: 'intent-send',
        text: 'send a message',
        goals: [],
        constraints: [],
      },
      { availableResources: ['network'] }
    );

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.simulation.steps[0].outcome).toBe('likely_failure');
    expect(result.simulation.warnings.join(' ')).toContain('missing resource');
  });

  it('simulates high confidence when every declared resource is present', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason(
      {
        id: 'intent-send',
        text: 'send a message',
        goals: [],
        constraints: [],
      },
      { availableResources: ['network', 'contacts'] }
    );

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.simulation.steps[0].outcome).toBe('success');
    expect(result.simulation.steps[0].confidence).toBeCloseTo(0.95, 5);
    expect(result.simulation.blocked).toEqual([]);
    expect(result.simulation.warnings).toEqual([]);
  });
});