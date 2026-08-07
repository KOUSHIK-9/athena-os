import { describe, expect, it } from 'vitest';
import type { CapabilityDescriptor, Goal } from '@athena-os/core';
import { DeterministicPlanBuilder } from './planBuilder.js';

const goals: Goal[] = [
  { id: 'g1', kind: 'openApp', description: 'Open Settings' },
  { id: 'g2', kind: 'toggleSetting', description: 'Toggle Wi-Fi' },
];

const capabilities: CapabilityDescriptor[] = [
  { id: 'app-launch', description: 'Launch an application', goalKinds: ['openApp'] },
  { id: 'settings-toggle', description: 'Toggle a setting', goalKinds: ['toggleSetting'] },
];

describe('DeterministicPlanBuilder', () => {
  const builder = new DeterministicPlanBuilder();

  it('builds one sequential step per binding in declaration order', () => {
    const plan = builder.buildPlan({
      intentId: 'intent-1',
      bindings: [
        { goal: goals[0], capability: capabilities[0] },
        { goal: goals[1], capability: capabilities[1] },
      ],
    });

    expect(plan.id).toBe('plan-intent-1');
    expect(plan.intentId).toBe('intent-1');
    expect(plan.steps).toHaveLength(2);

    expect(plan.steps[0]).toMatchObject({
      id: 'step-1',
      goalId: 'g1',
      capabilityId: 'app-launch',
      action: 'execute',
      dependsOn: [],
    });
    expect(plan.steps[1]).toMatchObject({
      id: 'step-2',
      goalId: 'g2',
      capabilityId: 'settings-toggle',
      dependsOn: ['step-1'],
    });
  });

  it('builds an empty plan for zero bindings', () => {
    const plan = builder.buildPlan({ intentId: 'intent-0', bindings: [] });
    expect(plan.steps).toEqual([]);
  });
});