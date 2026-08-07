import { describe, expect, it } from 'vitest';
import type { CapabilityDescriptor, CapabilityRegistry, ExecutionPlan } from '@athena-os/core';
import { DeterministicPlanValidator, isPlanValid } from './validator.js';

const capabilities: CapabilityDescriptor[] = [
  { id: 'app-launch', description: 'Launch an application', goalKinds: ['openApp'] },
  { id: 'settings-toggle', description: 'Toggle a setting', goalKinds: ['toggleSetting'] },
];

function registry(...descriptors: CapabilityDescriptor[]): CapabilityRegistry {
  return { capabilities: () => descriptors };
}

function step(id: string, capabilityId: string, dependsOn: string[] = []) {
  return {
    id,
    goalId: `goal-${id}`,
    capabilityId,
    action: 'execute',
    description: `step ${id}`,
    dependsOn,
  };
}

function samplePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    id: 'plan-1',
    intentId: 'intent-1',
    steps: [step('step-1', 'app-launch')],
    ...overrides,
  };
}

describe('DeterministicPlanValidator', () => {
  const validator = new DeterministicPlanValidator();

  it('accepts a valid plan with an empty suggestions/warnings set and a full trace', () => {
    const result = validator.validatePlan(samplePlan(), registry(...capabilities));

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect(result.trace.length).toBeGreaterThan(0);
    expect(result.trace.every((t) => t.outcome === 'passed')).toBe(true);
    expect(result.trace.map((t) => t.code)).toEqual(
      expect.arrayContaining(['PLAN_EMPTY', 'STEP_DUPLICATE_ID', 'STEP_UNKNOWN_CAPABILITY', 'STEP_UNKNOWN_DEPENDENCY', 'PLAN_CYCLIC'])
    );
  });

  it('rejects a plan with no steps (PLAN_EMPTY)', () => {
    const result = validator.validatePlan(samplePlan({ steps: [] }), registry(...capabilities));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: 'PLAN_EMPTY', severity: 'error' });
  });

  it('rejects steps referencing an unknown capability (STEP_UNKNOWN_CAPABILITY)', () => {
    const plan = samplePlan({
      steps: [step('step1', 'ghost-capability')],
    });
    const result = validator.validatePlan(plan, registry(...capabilities));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('STEP_UNKNOWN_CAPABILITY');
    expect(result.errors[0].message).toContain('ghost-capability');
  });

  it('rejects duplicate step ids (STEP_DUPLICATE_ID)', () => {
    const plan = samplePlan({
      steps: [
        step('step1', 'app-launch'),
        { ...step('step1', 'app-launch'), description: 'dup' },
      ],
    });
    const result = validator.validatePlan(plan, registry(...capabilities));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'STEP_DUPLICATE_ID')).toBe(true);
  });

  it('rejects steps depending on an unknown step (STEP_UNKNOWN_DEPENDENCY)', () => {
    const plan = samplePlan({ steps: [step('step1', 'app-launch', ['step-99'])] });
    const result = validator.validatePlan(plan, registry(...capabilities));
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('STEP_UNKNOWN_DEPENDENCY');
    expect(result.errors[0].message).toContain('step-99');
  });

  it('rejects cycles (PLAN_CYCLIC)', () => {
    const plan = samplePlan({
      steps: [
        step('a', 'app-launch', ['b']),
        step('b', 'app-launch', ['a']),
      ],
    });
    const result = validator.validatePlan(plan, registry(...capabilities));
    expect(result.valid).toBe(false);
    const cyclic = result.errors.find((e) => e.code === 'PLAN_CYCLIC');
    expect(cyclic).toBeDefined();
    expect(cyclic?.message).toContain('cycle');
    expect(result.trace.find((t) => t.code === 'PLAN_CYCLIC')?.outcome).toBe('failed');
  });

  it('warns when a step depends on a later-declared step (STEP_OUT_OF_ORDER)', () => {
    const plan = samplePlan({
      steps: [
        step('step1', 'app-launch', ['step2']),
        step('step2', 'settings-toggle'),
      ],
    });
    const result = validator.validatePlan(plan, registry(...capabilities));
    expect(result.valid).toBe(true);
    const warning = result.warnings.find((w) => w.code === 'STEP_OUT_OF_ORDER');
    expect(warning).toBeDefined();
    expect(warning?.stepId).toBe('step1');
    expect(warning?.message).toContain('declared later');
  });

  it('suggests removing transitive dependencies (STEP_TRANSITIVE_DEPENDENCY)', () => {
    const plan = samplePlan({
      steps: [
        step('step1', 'app-launch'),
        step('step2', 'app-launch', ['step1']),
        step('step3', 'settings-toggle', ['step1', 'step2']),
      ],
    });
    const result = validator.validatePlan(plan, registry(...capabilities));
    expect(result.valid).toBe(true);
    const suggestion = result.suggestions.find((s) => s.code === 'STEP_TRANSITIVE_DEPENDENCY');
    expect(suggestion).toBeDefined();
    expect(suggestion?.stepId).toBe('step3');
    expect(suggestion?.message).toContain('implied');
  });

  it('never mutates the plan while validating', () => {
    const plan = samplePlan({ steps: [step('step1', 'ghost-capability', ['step-99'])] });
    const snapshot = structuredClone(plan);
    validator.validatePlan(plan, registry(...capabilities));
    expect(plan).toEqual(snapshot);
  });
});

describe('isPlanValid', () => {
  it('reflects the errors array', () => {
    const validator = new DeterministicPlanValidator();
    const bad = validator.validatePlan(samplePlan({ steps: [] }), registry(...capabilities));
    const good = validator.validatePlan(samplePlan(), registry(...capabilities));
    expect(isPlanValid(good)).toBe(true);
    expect(isPlanValid(bad)).toBe(false);
  });
});