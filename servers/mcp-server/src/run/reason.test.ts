import { describe, expect, it } from 'vitest';
import {
  DeterministicExecutionGraphBuilder,
  DeterministicPlanValidator,
  DeterministicSimulator,
  ReasoningEngine,
  type ReasoningBackend,
} from '@athena-os/reasoning';
import { LlmReasoningBackend, type ModelClient } from '@athena-os/reasoning-backends';
import { iphoneRunRegistry } from './registry.js';
import { makeIntent, reasonForRun, resolveBackend } from './reason.js';
import { collectRunActions } from './planToAction.js';
import { runOnDevice } from './execute.js';

function buildEngine(backend: ReasoningBackend) {
  return new ReasoningEngine(iphoneRunRegistry, {
    backend,
    planValidator: new DeterministicPlanValidator(),
    simulator: new DeterministicSimulator(),
    executionGraphBuilder: new DeterministicExecutionGraphBuilder(),
  });
}

describe('reasonForRun (deterministic)', () => {
  it('resolves "Open Settings" to a launchApp plan', () => {
    const { intent, backendId, result } = reasonForRun('Open Settings', {
      backend: 'deterministic',
    });

    expect(backendId).toBe('deterministic');
    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.plan.steps[0].capabilityId).toBe('launchApp');

    const { actions, blocked } = collectRunActions(intent, result.plan.steps);
    expect(blocked).toHaveLength(0);
    expect(actions[0].action).toMatchObject({
      type: 'launchApp',
      bundleId: 'com.apple.Preferences',
    });
  });

  it('maps "Toggle Bluetooth" onto a tap step via the toggleSetting alias', () => {
    const { intent, result } = reasonForRun('Toggle Bluetooth', { backend: 'deterministic' });

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.plan.steps[0].capabilityId).toBe('tap');

    const { actions, blocked } = collectRunActions(intent, result.plan.steps);
    expect(blocked).toHaveLength(0);
    expect(actions[0].ok).toBe(true);
    if (actions[0].ok) {
      expect(actions[0].label).toBe('Bluetooth');
    }
  });

  it('asks for clarification when no capability can satisfy the goals', () => {
    const { result } = reasonForRun('Send a message to John', { backend: 'deterministic' });
    expect(result.kind).toBe('clarificationRequired');
  });

  it('auto-selects the deterministic backend when no API key is set', () => {
    delete process.env.ATHENA_OPENAI_API_KEY;
    const { id } = resolveBackend();
    expect(id).toBe('deterministic');
  });
});

describe('registry accepts LLM-invented goal kinds', () => {
  const modelClient: ModelClient = {
    id: 'test-model',
    extractGoals: (intent) => ({
      goals: [{ kind: 'navigateBack', description: intent.text ?? '' }],
    }),
  };

  it('forms a plan and maps it to a back action', () => {
    const { intent, result } = (() => {
      const intent = makeIntent('Go back to the previous screen');
      const backend = new LlmReasoningBackend(modelClient);
      const engine = buildEngine(backend);
      return { intent, result: engine.reason(intent) };
    })();

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;

    expect(result.plan.steps[0].capabilityId).toBe('back');
    const { actions, blocked } = collectRunActions(intent, result.plan.steps);
    expect(blocked).toHaveLength(0);
    expect(actions[0].action).toMatchObject({ type: 'back' });
  });
});

describe('runOnDevice dry-run', () => {
  it('reasons and previews without touching the device', async () => {
    const outcome = await runOnDevice({
      prompt: 'Open Settings',
      dryRun: true,
      backend: 'deterministic',
    });

    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'plan') {
      expect(outcome.dryRun).toBe(true);
      expect(outcome.actions).toHaveLength(1);
      expect(outcome.actions[0].action).toMatchObject({
        type: 'launchApp',
        bundleId: 'com.apple.Preferences',
      });
      expect(outcome.simulation).toBeDefined();
      expect(outcome.executionGraph).toBeDefined();
    }
  });
});
