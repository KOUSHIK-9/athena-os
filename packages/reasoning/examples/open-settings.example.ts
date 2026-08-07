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
  ],
};

describe('Scenario: Open Settings (single goal, single step)', () => {
  it('turns the phrase "Open Settings" into a validated one-step plan', () => {
    const engine = new DeterministicReasoningEngine(registry);

    const result = engine.reason({
      id: 'intent-open-settings',
      text: 'Open Settings',
      goals: [],
      constraints: [],
    });

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.plan.intentId).toBe('intent-open-settings');
    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].capabilityId).toBe('app-launch');
    expect(result.plan.steps[0].description).toContain('openApp');
  });
});