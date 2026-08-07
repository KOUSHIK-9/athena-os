import { describe, expect, it } from 'vitest';
import type { CapabilityRegistry, ExecutionPlan, PlanStep } from '@athena-os/core';
import { DeterministicPlanValidator } from '../src/index.js';

const registry: CapabilityRegistry = {
  capabilities: () => [
    { id: 'app-launch', description: 'Launch an application', goalKinds: ['openApp'] },
  ],
};

function step(id: string, capabilityId: string, dependsOn: string[] = []): PlanStep {
  return {
    id,
    goalId: `goal-${id}`,
    capabilityId,
    action: 'execute',
    description: `step ${id}`,
    dependsOn,
  };
}

function brokenPlan(): ExecutionPlan {
  return {
    id: 'plan-broken',
    intentId: 'intent-1',
    steps: [
      step('a', 'ghost-capability'),
      step('b', 'app-launch', ['a', 'ghost-step']),
      step('a', 'app-launch'),
      step('c', 'app-launch', ['c']),
    ],
  };
}

describe('Scenario: validator diagnostics on a broken plan', () => {
  it('reports every structural defect with code, severity, and trace', () => {
    const validator = new DeterministicPlanValidator();
    const result = validator.validatePlan(brokenPlan(), registry);

    expect(result.valid).toBe(false);

    const codes = result.errors.map((e) => e.code).sort();
    expect(codes).toEqual(
      expect.arrayContaining([
        'STEP_DUPLICATE_ID',
        'STEP_UNKNOWN_CAPABILITY',
        'STEP_UNKNOWN_DEPENDENCY',
        'PLAN_CYCLIC',
      ])
    );

    for (const error of result.errors) {
      expect(error.severity).toBe('error');
      expect(error.phase).toBe('structural');
      expect(error.code.length).toBeGreaterThan(0);
      expect(error.message.length).toBeGreaterThan(0);
    }

    expect(result.trace.find((t) => t.code === 'PLAN_CYCLIC')?.outcome).toBe('failed');
  });

  it('leaves the plan untouched after validation', () => {
    const validator = new DeterministicPlanValidator();
    const plan = brokenPlan();
    const snapshot = structuredClone(plan);

    validator.validatePlan(plan, registry);
    expect(plan).toEqual(snapshot);
  });
});