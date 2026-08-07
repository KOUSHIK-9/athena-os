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
      requiresResources: ['network'],
      reliability: 0.95,
    },
    {
      id: 'settings-toggle',
      description: 'Toggle a setting',
      goalKinds: ['toggleSetting'],
      availability: 'available',
      reliability: 0.9,
    },
  ],
};

describe('Scenario: an executable plan carries a dependency graph', () => {
  it('produces parallel sets and per-step levels for a two-goal intent', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason(
      {
        id: 'intent-multi',
        goals: [
          { id: 'g1', kind: 'toggleSetting', description: 'toggle airplane mode' },
          { id: 'g2', kind: 'sendMessage', description: 'send a message' },
        ],
        constraints: [],
      },
      { availableResources: ['network'] }
    );

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    const { plan, executionGraph } = result;

    expect(plan.steps).toHaveLength(2);

    // The plan builder serializes goals, so the graph is a linear chain:
    // one step per level, with an edge between them. The builder reports
    // exactly what the plan declares — it never invents parallelism.
    expect(executionGraph.nodes.map((n) => n.level)).toEqual([0, 1]);
    expect(executionGraph.nodes.map((n) => n.order)).toEqual([0, 1]);
    expect(executionGraph.edges).toEqual([
      { from: plan.steps[0].id, to: plan.steps[1].id },
    ]);
    expect(executionGraph.parallelSets).toEqual([[plan.steps[0].id], [plan.steps[1].id]]);
  });
});