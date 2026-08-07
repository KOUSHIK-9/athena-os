import { describe, expect, it } from 'vitest';
import type { CapabilityRegistry, Intent } from '@athena-os/core';
import type { ReasoningBackend, ReasoningBackendResult } from '@athena-os/reasoning';
import { runConformance, runParity, runScenario } from './conformance/harness.js';
import {
  flightSearchScenario,
  weekendTripScenario,
  behavioralScenarios,
} from './conformance/fixtures/behavioral.js';
import { parityScenarios } from './conformance/fixtures/parity.js';

/**
 * Stub backend that reproduces the canonical fixtures — the stand-in for a
 * real backend until an implementation exists (RFC-0012: conformance first).
 */
function fixtureBackend(
  id: string,
  lookup: (scenarioId: string) => ReasoningBackendResult
): ReasoningBackend {
  return {
    id,
    reason(intent: Intent, _registry: CapabilityRegistry): ReasoningBackendResult {
      const scenario = [...parityScenarios, ...behavioralScenarios].find(
        (scenario) => scenario.intent.id === intent.id
      );
      if (!scenario) {
        return { kind: 'clarificationRequired', reason: `no fixture for intent ${intent.id}` };
      }
      return lookup(scenario.id);
    },
  };
}

const conformingBackend = fixtureBackend('conforming', canonicalResult);

const planMutation: ReasoningBackendResult = {
  kind: 'executionPlan',
  plan: {
    id: 'plan-intent-open-settings',
    intentId: 'intent-open-settings',
    steps: [
      {
        id: 'step-1',
        goalId: 'goal-1',
        capabilityId: 'wrong-capability',
        action: 'execute',
        description: "Satisfy 'openApp' with 'wrong-capability'",
        dependsOn: [],
      },
    ],
  },
};

function canonicalResult(id: string): ReasoningBackendResult {
  return [...parityScenarios, ...behavioralScenarios].find((s) => s.id === id)!.expected;
}

describe('Conformance harness (RFC-0012)', () => {
  it('a conforming backend passes every canonical scenario', () => {
    const report = runConformance(conformingBackend, [...parityScenarios, ...behavioralScenarios]);

    expect(report.total).toBe(7);
    expect(report.passed).toBe(7);
    expect(report.failed).toBe(0);
    expect(report.results.every((result) => result.passed)).toBe(true);
  });

  it('rejects a plan that deviates from the canonical fixture', () => {
    const deviant = fixtureBackend('deviant', (id) =>
      id === 'open-settings' ? planMutation : canonicalResult(id)
    );

    const report = runConformance(deviant, parityScenarios);

    expect(report.failed).toBe(1);
    const failed = report.results.find((result) => !result.passed)!;
    expect(failed.scenarioId).toBe('open-settings');
    expect(failed.actual).toEqual(planMutation);
  });

  it('rejects when the result kind itself differs (plan vs clarification)', () => {
    const confused = fixtureBackend('confused', () => ({
      kind: 'clarificationRequired',
      reason: 'I do not understand',
    }));

    const report = runConformance(confused, parityScenarios);

    expect(report.failed).toBe(parityScenarios.length);
    expect(report.results.every((result) => result.actual?.kind === 'clarificationRequired')).toBe(
      true
    );
  });

  it('parity: two backends that agree pass; a diverging backend fails', () => {
    const other = fixtureBackend('other', canonicalResult);
    const parityReport = runParity(conformingBackend, other, parityScenarios);
    expect(parityReport.passed).toBe(parityScenarios.length);

    const diverging = fixtureBackend('diverging', (id) =>
      id === 'open-settings' ? planMutation : canonicalResult(id)
    );
    const divergingReport = runParity(conformingBackend, diverging, parityScenarios);
    expect(divergingReport.failed).toBe(1);
    expect(divergingReport.results.find((result) => !result.passed)!.scenarioId).toBe(
      'open-settings'
    );
  });

  it('behavioral fixtures are oracle-bound: flight search must yield a plan, not clarification', () => {
    const lazy = fixtureBackend('lazy', () => ({
      kind: 'clarificationRequired',
      reason: 'no extractable goals',
    }));

    const report = runConformance(lazy, behavioralScenarios);

    expect(report.failed).toBe(2);
    expect(report.results.every((result) => !result.passed)).toBe(true);
  });

  it('reports the whole result on mismatch (deep equality, not goal containment)', () => {
    const result = runScenario(conformingBackend, flightSearchScenario);
    expect(result.passed).toBe(true);

    const weekendResult = runScenario(conformingBackend, weekendTripScenario);
    expect(weekendResult.layer).toBe('behavioral');
    expect(weekendResult.passed).toBe(true);
  });
});
