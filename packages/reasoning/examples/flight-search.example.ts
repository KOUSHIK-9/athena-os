import { describe, expect, it } from 'vitest';
import type { CapabilityRegistry } from '@athena-os/core';
import { DeterministicReasoningEngine } from '../src/index.js';

const registry: CapabilityRegistry = {
  capabilities: () => [
    {
      id: 'app-launch',
      description: 'Launch an application',
      goalKinds: ['openApp'],
    },
    {
      id: 'messages-send',
      description: 'Send a message',
      goalKinds: ['sendMessage'],
    },
  ],
};

describe('Scenario: flight search (the clarification seam)', () => {
  it('does not invent goals for free-form language', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason({
      id: 'intent-flight-search',
      text: 'find me flights to Tokyo under $500',
      goals: [],
      constraints: [],
    });

    expect(result.kind).toBe('clarificationRequired');
    if (result.kind !== 'clarificationRequired') return;

    expect(result.reason).toContain('no extractable goals');
  });

  it('produces a plan when the same travel intent arrives as structured goals', () => {
    const registryWithFlights: CapabilityRegistry = {
      capabilities: () => [
        ...registry.capabilities(),
        {
          id: 'flights-search',
          description: 'Search flight itineraries',
          goalKinds: ['searchFlights'],
        },
      ],
    };
    const engine = new DeterministicReasoningEngine(registryWithFlights);

    const result = engine.reason({
      id: 'intent-flight-search',
      goals: [
        {
          id: 'g1',
          kind: 'searchFlights',
          description: 'Find flights to Tokyo under $500',
        },
      ],
      constraints: [],
    });

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].capabilityId).toBe('flights-search');
  });
});