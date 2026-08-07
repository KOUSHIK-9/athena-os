import { describe, expect, it } from 'vitest';
import type { CapabilityDescriptor, CapabilityRegistry, ExecutionPlan } from '@athena-os/core';
import { DeterministicPlanValidator } from './validator.js';

const capabilities: CapabilityDescriptor[] = [
  { id: 'app-launch', description: 'Launch an application', goalKinds: ['openApp'] },
];

function registry(...descriptors: CapabilityDescriptor[]): CapabilityRegistry {
  return { capabilities: () => descriptors };
}

function samplePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    id: 'plan-1',
    intentId: 'intent-1',
    steps: [
      {
        id: 'step-1',
        goalId: 'g1',
        capabilityId: 'app-launch',
        action: 'execute',
        description: 'Launch',
        dependsOn: [],
      },
    ],
    ...overrides,
  };
}

describe('DeterministicPlanValidator', () => {
  const validator = new DeterministicPlanValidator();

  it('accepts a plan whose steps resolve to registered capabilities', () => {
    const result = validator.validatePlan(samplePlan(), registry(...capabilities));
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('rejects a plan with no steps', () => {
    const result = validator.validatePlan(samplePlan({ steps: [] }), registry(...capabilities));
    expect(result.valid).toBe(false);
    expect(result.violations[0].message).toContain('contains no steps');
  });

  it('rejects steps referencing an unknown capability', () => {
    const plan = samplePlan({
      steps: [
        {
          id: 'step-1',
          goalId: 'g1',
          capabilityId: 'ghost-capability',
          action: 'execute',
          description: 'Launch',
          dependsOn: [],
        },
      ],
    });
    const result = validator.validatePlan(plan, registry(...capabilities));
    expect(result.valid).toBe(false);
    expect(result.violations[0].message).toContain("unknown capability 'ghost-capability'");
  });

  it('rejects duplicate step ids', () => {
    const plan = samplePlan({
      steps: [
        {
          id: 'step-1',
          goalId: 'g1',
          capabilityId: 'app-launch',
          action: 'execute',
          description: 'Launch',
          dependsOn: [],
        },
        {
          id: 'step-1',
          goalId: 'g2',
          capabilityId: 'app-launch',
          action: 'execute',
          description: 'Launch again',
          dependsOn: [],
        },
      ],
    });
    const result = validator.validatePlan(plan, registry(...capabilities));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.message.includes('duplicate step id'))).toBe(true);
  });

  it('rejects steps depending on an unknown step', () => {
    const plan = samplePlan({
      steps: [
        {
          id: 'step-1',
          goalId: 'g1',
          capabilityId: 'app-launch',
          action: 'execute',
          description: 'Launch',
          dependsOn: ['step-99'],
        },
      ],
    });
    const result = validator.validatePlan(plan, registry(...capabilities));
    expect(result.valid).toBe(false);
    expect(result.violations[0].message).toContain("depends on unknown step 'step-99'");
  });
});
