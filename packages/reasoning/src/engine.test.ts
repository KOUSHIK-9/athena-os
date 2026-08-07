import { describe, expect, it } from 'vitest';
import type {
  CapabilityDescriptor,
  CapabilityRegistry,
  Constraint,
  Intent,
} from '@athena-os/core';
import { DeterministicReasoningEngine } from './engine.js';

const registry: CapabilityRegistry = {
  capabilities: () =>
    [
      { id: 'app-launch', description: 'Launch an application', goalKinds: ['openApp'] },
      { id: 'messages-send', description: 'Send a message', goalKinds: ['sendMessage'] },
    ] satisfies CapabilityDescriptor[],
};

function sampleIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    id: 'intent-1',
    goals: [{ id: 'g1', kind: 'openApp', description: 'Open Settings' }],
    constraints: [],
    ...overrides,
  };
}

describe('DeterministicReasoningEngine', () => {
  const engine = new DeterministicReasoningEngine(registry);

  it('produces a validated execution plan for a satisfiable intent', () => {
    const result = engine.reason(sampleIntent());

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.plan.intentId).toBe('intent-1');
    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].capabilityId).toBe('app-launch');
  });

  it('requests clarification when the intent carries no goals', () => {
    const result = engine.reason(sampleIntent({ goals: [] }));
    expect(result.kind).toBe('clarificationRequired');
  });

  it('rejects the intent when a goal is forbidden by a constraint', () => {
    const constraints: Constraint[] = [
      { id: 'c1', kind: 'forbid', goalKind: 'openApp', category: 'hard', reason: 'app launching disabled' },
    ];
    const result = engine.reason(sampleIntent({ constraints }));
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reasons[0]).toContain('app launching disabled');
  });

  it('requests clarification when no capability satisfies a goal kind', () => {
    const result = engine.reason(
      sampleIntent({
        goals: [{ id: 'g1', kind: 'flyPlane', description: 'Fly a plane' }],
      })
    );
    expect(result.kind).toBe('clarificationRequired');
    if (result.kind !== 'clarificationRequired') return;
    expect(result.reason).toContain("no capability for goals: flyPlane");
  });
});
