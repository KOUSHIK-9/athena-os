import { describe, it, expect } from 'vitest';
import { parityScenarios } from './conformance/fixtures/parity.js';
import { behavioralScenarios } from './conformance/fixtures/behavioral.js';
import type { ScenarioInput } from './compare.js';
import { runComparison, buildComparisonBackends } from './compare.js';

/**
 * Three-way backend comparison (RFC-0012 §Conformance follow-on).
 *
 * Reuses the canonical conformance scenarios as the shared scenario set, so the
 * same intents run through every backend. Each leg is gated:
 *   - deterministic: always runs (no network).
 *   - apple on-device: runs only when ATHENA_COMPARE_LIVE=1 (zero network, but
 *     invokes the local FoundationModels model — opted in to keep CI fast).
 *   - openai/zen: runs only when an API key is provided (network required).
 *
 * The report is printed so latency / validity / success / network-dependency can
 * be compared directly across backends.
 */

function toScenarios(): ScenarioInput[] {
  return [...parityScenarios, ...behavioralScenarios].map((scenario) => ({
    id: scenario.id,
    intent: scenario.intent,
    registry: scenario.registry,
  }));
}

describe('three-way backend comparison (Deterministic / Apple on-device / OpenAI-Zen)', () => {
  const scenarios = toScenarios();
  const liveApple = process.env.ATHENA_COMPARE_LIVE === '1';
  const openAIApiKey = process.env.OPENAI_API_KEY ?? process.env.ATHENA_OPENAI_API_KEY;

  const backends = buildComparisonBackends({ liveApple, openAIApiKey });
  const report = runComparison(scenarios, backends);

  console.log(
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        scenarios: report.scenarios,
        backends: report.backends.map((b) => ({
          backendId: b.backendId,
          networkDependency: b.networkDependency,
          available: b.available,
          scenariosRun: b.scenariosRun,
          successCount: b.successCount,
          validPlanCount: b.validPlanCount,
          avgLatencyMs: b.avgLatencyMs,
        })),
      },
      null,
      2
    )
  );

  it('covers every scenario against every available backend', () => {
    expect(report.scenarios).toBe(scenarios.length);
    expect(report.backends.length).toBeGreaterThanOrEqual(1);

    for (const row of report.backends) {
      if (!row.available) continue;
      expect(row.scenariosRun).toBe(scenarios.length);
    }
  });

  it('deterministic backend is always available and produces only valid plans', () => {
    const det = report.backends.find((b) => b.backendId === 'deterministic');
    expect(det).toBeDefined();
    expect(det!.available).toBe(true);
    expect(det!.scenariosRun).toBe(scenarios.length);
    // Every executionPlan the deterministic backend emits must be valid.
    const produced = det!.measurements.filter((m) => m.kind === 'executionPlan');
    expect(det!.validPlanCount).toBe(produced.length);
  });

  it('gates the Apple on-device leg behind opt-in (no model call without ATHENA_COMPARE_LIVE)', () => {
    const apple = report.backends.find((b) => b.backendId === 'apple:system-language-model');
    expect(apple).toBeDefined();
    expect(apple!.networkDependency).toBe(false);
    expect(apple!.available).toBe(liveApple);
  });

  it('gates the OpenAI/Zen leg behind a configured API key', () => {
    const zen = report.backends.find((b) => b.backendId === 'openai:gpt');
    if (openAIApiKey) {
      expect(zen).toBeDefined();
      expect(zen!.networkDependency).toBe(true);
    } else {
      expect(zen).toBeUndefined();
    }
  });
});
