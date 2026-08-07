import { describe, expect, it } from 'vitest';
import type { CapabilityDescriptor, CapabilityRegistry, Intent } from '@athena-os/core';
import type { ReasoningBackend, ReasoningBackendResult } from './backend.js';
import { DeterministicExecutionGraphBuilder } from './executionGraphBuilder.js';
import { ReasoningEngine } from './engine.js';
import { DeterministicSimulator } from './simulator.js';
import { DeterministicPlanValidator } from './validator.js';

/**
 * RFC-0012 proof: the engine is backend-agnostic. These tests drive
 * `ReasoningEngine` with foreign backends (stubs behaving like a future
 * LLM backend) and assert the engine only validates, simulates, and
 * graphs the candidate — it never re-plans and never knows which backend
 * produced the candidate.
 */

const registry: CapabilityRegistry = {
  capabilities: () =>
    [
      { id: 'app-launch', description: 'Launch an application', goalKinds: ['openApp'] },
    ] satisfies CapabilityDescriptor[],
};

function fixedPlanBackend(): ReasoningBackend {
  return {
    id: 'stub-fixed-plan',
    reason(intent: Intent): ReasoningBackendResult {
      return {
        kind: 'executionPlan',
        plan: {
          id: `plan-${intent.id}`,
          intentId: intent.id,
          steps: [
            {
              id: 'step-1',
              goalId: 'goal-1',
              capabilityId: 'app-launch',
              action: 'execute',
              description: "Satisfy 'openApp' with 'app-launch'",
              dependsOn: [],
            },
          ],
        },
      };
    },
  };
}

const invalidPlanBackend: ReasoningBackend = {
  id: 'stub-invalid',
  reason(intent: Intent): ReasoningBackendResult {
    return {
      kind: 'executionPlan',
      plan: {
        id: `plan-${intent.id}`,
        intentId: intent.id,
        steps: [
          {
            id: 'step-1',
            goalId: 'goal-1',
            capabilityId: 'not-a-registered-capability',
            action: 'execute',
            description: 'references an unknown capability',
            dependsOn: [],
          },
        ],
      },
    };
  },
};

const clarifyingBackend: ReasoningBackend = {
  id: 'stub-clarify',
  reason(): ReasoningBackendResult {
    return { kind: 'clarificationRequired', reason: 'the backend needs more context' };
  },
};

function makeEngine(backend: ReasoningBackend): ReasoningEngine {
  return new ReasoningEngine(registry, {
    backend,
    planValidator: new DeterministicPlanValidator(),
    simulator: new DeterministicSimulator(),
    executionGraphBuilder: new DeterministicExecutionGraphBuilder(),
  });
}

const intent: Intent = {
  id: 'intent-1',
  text: 'anything',
  goals: [],
  constraints: [],
};

describe('ReasoningEngine (RFC-0012 backend integration)', () => {
  it('accepts an arbitrary backend and turns its candidate into a full result', () => {
    const engine = makeEngine(fixedPlanBackend());

    const result = engine.reason(intent);

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.plan.intentId).toBe('intent-1');
    expect(result.plan.steps[0].capabilityId).toBe('app-launch');
    expect(result.executionGraph.nodes).toHaveLength(1);
    expect(result.executionGraph.nodes[0].stepId).toBe('step-1');
    expect(result.simulation.steps).toHaveLength(1);
  });

  it('passes a backend clarification request through untouched', () => {
    const result = makeEngine(clarifyingBackend).reason(intent);

    expect(result).toEqual({
      kind: 'clarificationRequired',
      reason: 'the backend needs more context',
    });
  });

  it('rejects a candidate whose plan fails validation', () => {
    const result = makeEngine(invalidPlanBackend).reason(intent);

    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reasons.join(' ')).toContain('unknown capability');
  });

  it('never re-plans: the validated plan is the candidate plan, verbatim', () => {
    const result = makeEngine(fixedPlanBackend()).reason(intent);

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;
    expect(result.plan).toEqual({
      id: 'plan-intent-1',
      intentId: 'intent-1',
      steps: [
        {
          id: 'step-1',
          goalId: 'goal-1',
          capabilityId: 'app-launch',
          action: 'execute',
          description: "Satisfy 'openApp' with 'app-launch'",
          dependsOn: [],
        },
      ],
    });
  });
});
