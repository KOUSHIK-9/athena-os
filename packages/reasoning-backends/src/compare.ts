import type { CapabilityRegistry, Intent } from '@athena-os/core';
import {
  DeterministicPlanValidator,
  type ReasoningBackend,
  type ReasoningBackendResult,
} from '@athena-os/reasoning';
import { DeterministicReasoningBackend } from './deterministic/index.js';
import { LlmReasoningBackend } from './llm/LlmReasoningBackend.js';
import { AppleModelClient } from './apple/appleModelClient.js';
import { OpenAIModelClient } from './openai/openAiModelClient.js';
import { openAIConfigFromEnv } from './openai/openAiConfig.js';

/**
 * Three-way backend comparison (RFC-0012 §Conformance follow-on).
 *
 * Runs the SAME scenarios through every available backend and measures:
 *   - latency (wall-clock per scenario),
 *   - validity (does the produced ExecutionPlan pass the authoritative
 *     DeterministicPlanValidator?),
 *   - success rate (how many scenarios yield an executionPlan vs
 *     clarificationRequired / rejected / error),
 *   - network dependency (static per backend: deterministic + Apple on-device
 *     make zero network calls; OpenAI/Zen require the network).
 *
 * Backends are passed in explicitly so the harness stays pure and each leg is
 * gated by the caller (live model only when opted in; OpenAI/Zen only when a
 * key is configured).
 */

export interface BackendUnderTest {
  id: string;
  backend: ReasoningBackend;
  networkDependency: boolean;
  available: boolean;
}

export interface ScenarioInput {
  id: string;
  intent: Intent;
  registry: CapabilityRegistry;
}

export interface ScenarioMeasurement {
  scenarioId: string;
  kind: ReasoningBackendResult['kind'] | 'error';
  latencyMs: number;
  validPlan: boolean | null;
  error?: string;
}

export interface BackendComparisonRow {
  backendId: string;
  networkDependency: boolean;
  available: boolean;
  scenariosRun: number;
  successCount: number;
  validPlanCount: number;
  avgLatencyMs: number;
  measurements: ScenarioMeasurement[];
}

export interface ComparisonReport {
  generatedAt: string;
  scenarios: number;
  backends: BackendComparisonRow[];
}

const validator = new DeterministicPlanValidator();

export function runComparison(
  scenarios: readonly ScenarioInput[],
  backends: readonly BackendUnderTest[]
): ComparisonReport {
  const rows: BackendComparisonRow[] = backends.map((b) => {
    if (!b.available) {
      return {
        backendId: b.id,
        networkDependency: b.networkDependency,
        available: false,
        scenariosRun: 0,
        successCount: 0,
        validPlanCount: 0,
        avgLatencyMs: 0,
        measurements: [],
      };
    }

    const measurements: ScenarioMeasurement[] = [];
    for (const scenario of scenarios) {
      const start = Date.now();
      let result: ReasoningBackendResult | undefined;
      let error: string | undefined;
      try {
        result = b.backend.reason(scenario.intent, scenario.registry);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      const latencyMs = Date.now() - start;
      const kind = error ? ('error' as const) : (result!.kind as ReasoningBackendResult['kind']);
      let validPlan: boolean | null = null;
      if (!error && result!.kind === 'executionPlan') {
        validPlan = validator.validatePlan(result!.plan, scenario.registry).valid;
      }
      measurements.push({
        scenarioId: scenario.id,
        kind,
        latencyMs,
        validPlan,
        ...(error ? { error } : {}),
      });
    }

    const successCount = measurements.filter((m) => m.kind === 'executionPlan').length;
    const validPlanCount = measurements.filter((m) => m.validPlan === true).length;
    const avgLatencyMs =
      measurements.length === 0
        ? 0
        : Math.round(measurements.reduce((sum, m) => sum + m.latencyMs, 0) / measurements.length);

    return {
      backendId: b.id,
      networkDependency: b.networkDependency,
      available: true,
      scenariosRun: measurements.length,
      successCount,
      validPlanCount,
      avgLatencyMs,
      measurements,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    scenarios: scenarios.length,
    backends: rows,
  };
}

export interface ComparisonBackendOptions {
  /** Run the on-device Apple model (zero network; requires Apple Intelligence). */
  liveApple?: boolean;
  /** When set, the OpenAI/Zen leg runs (network required). */
  openAIApiKey?: string;
}

/**
 * Builds the standard three-way comparison backends, each gated:
 *  - deterministic: always available, no network.
 *  - apple: on-device, no network; only "available" when opted in so the model
 *    is not invoked on every test run.
 *  - openai/zen: only when an API key is supplied (network required).
 */
export function buildComparisonBackends(opts: ComparisonBackendOptions = {}): BackendUnderTest[] {
  const backends: BackendUnderTest[] = [
    {
      id: 'deterministic',
      backend: new DeterministicReasoningBackend(),
      networkDependency: false,
      available: true,
    },
  ];

  backends.push({
    id: 'apple:system-language-model',
    backend: new LlmReasoningBackend(new AppleModelClient()),
    networkDependency: false,
    available: opts.liveApple === true,
  });

  if (opts.openAIApiKey) {
    backends.push({
      id: 'openai:gpt',
      backend: new LlmReasoningBackend(new OpenAIModelClient(openAIConfigFromEnv())),
      networkDependency: true,
      available: true,
    });
  }

  return backends;
}
