import { isDeepStrictEqual } from 'node:util';
import type { ReasoningBackend, ReasoningBackendResult } from '@athena-os/reasoning';
import type { ConformanceScenario } from './scenario.js';

export interface ScenarioResult {
  scenarioId: string;
  layer: 'parity' | 'behavioral';
  passed: boolean;
  actual: ReasoningBackendResult | undefined;
  expected: ReasoningBackendResult;
}

export interface ConformanceReport {
  backendId: string;
  total: number;
  passed: number;
  failed: number;
  results: ScenarioResult[];
}

/**
 * Runs a single backend against a single scenario. The oracle is the
 * scenario's expected result — a frozen canonical fixture for `parity`, an
 * authored contract fixture for `behavioral`. Either way, conformance means
 * deep equality (RFC-0012 §Conformance).
 */
export function runScenario(
  backend: ReasoningBackend,
  scenario: ConformanceScenario
): ScenarioResult {
  const actual = backend.reason(scenario.intent, scenario.registry);
  return {
    scenarioId: scenario.id,
    layer: scenario.layer,
    passed: isDeepStrictEqual(actual, scenario.expected),
    actual,
    expected: scenario.expected,
  };
}

/**
 * Runs a backend against the whole scenario suite and reports per-scenario
 * results. A backend conforms when every scenario passes.
 */
export function runConformance(
  backend: ReasoningBackend,
  scenarios: readonly ConformanceScenario[]
): ConformanceReport {
  const results = scenarios.map((scenario) => runScenario(backend, scenario));
  const passed = results.filter((result) => result.passed).length;
  return {
    backendId: backend.id,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

/**
 * Parity check between two backends: for every `parity` scenario, both
 * backends must produce deep-equal results. Behavioral scenarios are
 * excluded — their oracle is the authored fixture, not another backend.
 */
export function runParity(
  backendA: ReasoningBackend,
  backendB: ReasoningBackend,
  scenarios: readonly ConformanceScenario[]
): ConformanceReport {
  const parityScenarios = scenarios.filter((scenario) => scenario.layer === 'parity');
  const results = parityScenarios.map((scenario) => {
    const actualA = backendA.reason(scenario.intent, scenario.registry);
    const actualB = backendB.reason(scenario.intent, scenario.registry);
    return {
      scenarioId: scenario.id,
      layer: scenario.layer as 'parity',
      passed: isDeepStrictEqual(actualA, actualB),
      actual: actualA,
      expected: actualB,
    };
  });
  const passed = results.filter((result) => result.passed).length;
  return {
    backendId: `${backendA.id} ↔ ${backendB.id}`,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
