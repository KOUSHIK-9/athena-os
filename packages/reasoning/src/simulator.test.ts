import { describe, expect, it } from 'vitest';
import type {
  CapabilityDescriptor,
  CapabilityRegistry,
  PlanStep,
  SimulationEnvironment,
} from '@athena-os/core';
import { DeterministicSimulator } from './simulator.js';

function descriptor(overrides: Partial<CapabilityDescriptor> & { id: string }): CapabilityDescriptor {
  return {
    description: 'test capability',
    goalKinds: [],
    availability: 'available',
    requiresResources: [],
    ...overrides,
  };
}

function registry(...capabilities: CapabilityDescriptor[]): CapabilityRegistry {
  return { capabilities: () => capabilities };
}

function step(id: string, capabilityId: string): PlanStep {
  return {
    id,
    goalId: `goal-${id}`,
    capabilityId,
    action: 'execute',
    description: `step ${id}`,
    dependsOn: [],
  };
}

function plan(...steps: PlanStep[]) {
  return { id: 'plan-1', intentId: 'intent-1', steps };
}

function environment(availableResources: string[] = []): SimulationEnvironment {
  return { availableResources };
}

describe('DeterministicSimulator', () => {
  const simulator = new DeterministicSimulator();

  it('predicts failure for a capability declared unavailable', () => {
    const caps = registry(descriptor({ id: 'blocked-cap', availability: 'unavailable' }));
    const result = simulator.simulate(plan(step('s1', 'blocked-cap')), environment(), caps);

    expect(result.steps[0].outcome).toBe('failure');
    expect(result.steps[0].confidence).toBe(0);
    expect(result.blocked).toContain('blocked-cap');
    expect(result.overallConfidence).toBe(0);
  });

  it('warns when a capability requires a resource absent from the environment', () => {
    const caps = registry(
      descriptor({ id: 'net-cap', requiresResources: ['network'], reliability: 0.9 })
    );
    const result = simulator.simulate(plan(step('s1', 'net-cap')), environment([]), caps);

    expect(result.steps[0].outcome).toBe('likely_failure');
    expect(result.steps[0].confidence).toBeCloseTo(0.45, 5);
    expect(result.warnings.join()).toContain('missing resource');
  });

  it('predicts success when required resources are available', () => {
    const caps = registry(
      descriptor({ id: 'net-cap', requiresResources: ['network'], reliability: 0.9 })
    );
    const result = simulator.simulate(plan(step('s1', 'net-cap')), environment(['network']), caps);

    expect(result.steps[0].outcome).toBe('success');
    expect(result.steps[0].confidence).toBeCloseTo(0.9, 5);
    expect(result.blocked).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('is honest when no reliability is declared', () => {
    const caps = registry(descriptor({ id: 'mystery-cap' }));
    const result = simulator.simulate(plan(step('s1', 'mystery-cap')), environment(), caps);

    expect(result.steps[0].outcome).toBe('unknown');
    expect(result.steps[0].confidence).toBe(0.5);
    expect(result.steps[0].reasons.join()).toContain('declares no reliability');
  });

  it('reports unknown for steps whose capability is not in the registry', () => {
    const result = simulator.simulate(plan(step('s1', 'ghost-cap')), environment(), registry());

    expect(result.steps[0].outcome).toBe('unknown');
    expect(result.steps[0].confidence).toBe(0);
    expect(result.steps[0].reasons.join()).toContain('not in the registry');
  });

  it('averages confidence across steps for the overall score', () => {
    const caps = registry(
      descriptor({ id: 'good-cap', reliability: 1 }),
      descriptor({ id: 'mid-cap', reliability: 0.6 })
    );
    const result = simulator.simulate(
      plan(step('s1', 'good-cap'), step('s2', 'mid-cap')),
      environment(),
      caps
    );

    expect(result.overallConfidence).toBeCloseTo(0.8, 5);
  });
});