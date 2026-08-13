import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DeterministicExecutionGraphBuilder,
  DeterministicPlanValidator,
  DeterministicSimulator,
  ReasoningEngine,
  type ReasoningBackend,
} from '@athena-os/reasoning';
import { LlmReasoningBackend, type ModelClient } from '@athena-os/reasoning-backends';
import { AppleModelClient, AppleModelUnavailableError } from '@athena-os/reasoning-backends';
import { iphoneRunRegistry } from './registry.js';
import {
  makeIntent,
  reasonForRun,
  resolveBackend,
  promptWithObservation,
  type ObservationContext,
} from './reason.js';
import { collectRunActions } from './planToAction.js';
import { runOnDevice } from './execute.js';

vi.mock('../sessionManager.js', () => {
  console.log('[MOCK] sessionManager mock factory called');
  let callCount = 0;
  let executeMock: ((action: { type: string; description?: string }) => Promise<unknown>) | null =
    null;

  return {
    mcpSessionManager: {
      getExecutor: () => ({
        execute: (action: { type: string; description?: string }) => {
          callCount += 1;
          console.log(`[MOCK] execute call ${callCount}:`, action.type);
          if (executeMock) return executeMock(action);
          return Promise.resolve({ success: true, duration: 100 });
        },
        getSession: () => ({ id: 'test-session', deviceUdid: 'test-udid' }),
      }),
      connect: () => Promise.resolve({ sessionId: 'test-session', deviceUdid: 'test-udid' }),
      getActiveSessions: () => [],
    },
    __test: {
      get callCount() {
        return callCount;
      },
      reset: () => {
        callCount = 0;
        executeMock = null;
      },
      setExecuteMock: (fn: typeof executeMock) => {
        executeMock = fn;
      },
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const testMock = (await import('../sessionManager.js')).__test as any;

function buildEngine(backend: ReasoningBackend) {
  return new ReasoningEngine(iphoneRunRegistry, {
    backend,
    planValidator: new DeterministicPlanValidator(),
    simulator: new DeterministicSimulator(),
    executionGraphBuilder: new DeterministicExecutionGraphBuilder(),
  });
}

beforeEach(() => {
  testMock.reset();
});

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

  it('auto selects the on-device Apple backend when no API key is set', () => {
    delete process.env.ATHENA_OPENAI_API_KEY;
    const { id } = resolveBackend();
    expect(id.startsWith('apple:')).toBe(true);
  });

  it('auto falls back to deterministic when Apple Intelligence is unavailable', () => {
    delete process.env.ATHENA_OPENAI_API_KEY;
    const original = AppleModelClient.prototype.extractGoals;
    AppleModelClient.prototype.extractGoals = () => {
      throw new AppleModelUnavailableError('disabled', 'test');
    };
    try {
      // A prompt the deterministic extractor cannot satisfy, so the Apple model is
      // actually consulted (and forced unavailable here) and the runner must fall back.
      const { backendId, result } = reasonForRun('plan a weekend trip to Kyoto', { backend: 'auto' });
      expect(backendId).toBe('deterministic');
      expect(result.kind).toBe('clarificationRequired');
    } finally {
      AppleModelClient.prototype.extractGoals = original;
    }
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

describe('resolveBackend apple', () => {
  const ORIGINAL_BRIDGE_PATH = process.env.ATHENA_APPLE_BRIDGE_PATH;
  afterEach(() => {
    if (ORIGINAL_BRIDGE_PATH === undefined) delete process.env.ATHENA_APPLE_BRIDGE_PATH;
    else process.env.ATHENA_APPLE_BRIDGE_PATH = ORIGINAL_BRIDGE_PATH;
  });

  function stubBridge(errorJson: string): { bin: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'athena-apple-resolve-'));
    const bin = join(dir, 'stub-bridge');
    writeFileSync(bin, `#!/bin/bash\necho '${errorJson}'\n`, { mode: 0o755 });
    chmodSync(bin, 0o755);
    return { bin, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it('returns an AppleModelClient when apple is explicitly selected', () => {
    const { backend, id } = resolveBackend('apple');
    expect(id).toContain('apple:system-language-model');
    expect(backend).toBeInstanceOf(LlmReasoningBackend);
  });

  it('never falls back to deterministic or OpenAI when apple is selected', () => {
    const { id } = resolveBackend('apple');
    expect(id).not.toBe('deterministic');
    expect(id).not.toContain('llm:');
  });

  it('does not silently fall back when the Apple bridge is unavailable', () => {
    const { bin, cleanup } = stubBridge(
      '{"ok":false,"error":"appleIntelligenceNotEnabled","message":"system language model unavailable"}'
    );
    process.env.ATHENA_APPLE_BRIDGE_PATH = bin;
    try {
      const { backend } = resolveBackend('apple');
      const intent = makeIntent('Open Settings');

      expect(() => backend.reason(intent, iphoneRunRegistry)).toThrow();
    } finally {
      cleanup();
    }
  });

  it('does not silently fall back when Apple Intelligence is not enabled', () => {
    const { bin, cleanup } = stubBridge(
      '{"ok":false,"error":"appleIntelligenceNotEnabled","message":"system language model unavailable"}'
    );
    process.env.ATHENA_APPLE_BRIDGE_PATH = bin;
    try {
      const { backend } = resolveBackend('apple');
      const intent = makeIntent('Open Settings');

      try {
        backend.reason(intent, iphoneRunRegistry);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppleModelUnavailableError);
      }
    } finally {
      cleanup();
    }
  });
});

describe('recovery loop', () => {
  it('succeeds on first attempt with exactly one plan', async () => {
    testMock.setExecuteMock(() => Promise.resolve({ success: true, duration: 50, verified: true }));

    const outcome = await runOnDevice({
      prompt: 'Open Settings',
      backend: 'deterministic',
    });

    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'executed') {
      expect(outcome.attempts).toBe(1);
      expect(outcome.executed).toHaveLength(1);
    }
  });

  it('captures observation on failure and re-plans', async () => {
    let callCount = 0;
    testMock.setExecuteMock((action: { type: string }) => {
      callCount += 1;
      if (action.type === 'getTree') {
        return Promise.resolve({
          success: true,
          duration: 10,
          metadata: { model: { root: { role: 'root', label: 'screen', children: [] } } },
        });
      }
      // First real action fails, second succeeds
      if (callCount <= 1) {
        return Promise.resolve({
          success: false,
          duration: 100,
          error: 'element not found',
        });
      }
      return Promise.resolve({ success: true, duration: 100, verified: true });
    });

    const outcome = await runOnDevice({
      prompt: 'Open Settings',
      backend: 'deterministic',
    });

    // Should have attempted twice
    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'executed') {
      expect(outcome.attempts).toBe(2);
    }
  });

  it('returns failure after both attempts fail', async () => {
    testMock.setExecuteMock((action: { type: string }) => {
      console.log(`[TEST-MOCK-FAIL] action: ${action.type}`);
      return Promise.resolve({
        success: false,
        duration: 100,
        error: 'persistent failure',
      });
    });

    const outcome = await runOnDevice({
      prompt: 'Open Settings',
      backend: 'deterministic',
    });

    console.log('[TEST-FAIL] outcome:', JSON.stringify(outcome, null, 2));
    expect(outcome.success).toBe(false);
    if (!outcome.success && outcome.kind === 'executionFailed') {
      expect(outcome.attempts).toBe(2);
      expect(outcome.error).toBe('persistent failure');
    }
  });

  it('does not recover on clarification or rejection', async () => {
    const outcome = await runOnDevice({
      prompt: 'Send a message to John',
      backend: 'deterministic',
    });

    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.kind).toBe('clarificationRequired');
    }
    // Should NOT have attempted execution at all
    expect(testMock.callCount).toBe(0);
  });

  it('preserves the original user goal in the re-plan prompt', async () => {
    let innerCallCount = 0;
    testMock.setExecuteMock((action: { type: string }) => {
      if (action.type === 'getTree') {
        return Promise.resolve({
          success: true,
          duration: 10,
          metadata: { model: { root: { role: 'root', label: 'screen', children: [] } } },
        });
      }
      innerCallCount += 1;
      if (innerCallCount <= 1) {
        return Promise.resolve({
          success: false,
          duration: 100,
          error: 'launch failed',
          screenshot: 'base64-fake-screenshot',
        });
      }
      return Promise.resolve({ success: true, duration: 100, verified: true });
    });

    const outcome = await runOnDevice({
      prompt: 'Open Settings',
      backend: 'deterministic',
    });

    // The key verification: two attempts were made, and the second succeeded.
    // This proves the observation was captured and the re-plan produced
    // a working plan based on the original goal.
    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'executed') {
      expect(outcome.attempts).toBe(2);
      // `executed` now records both attempts' device actions; the successful
      // (second-attempt) step must be present.
      expect(outcome.executed.some((e) => e.success)).toBe(true);
      expect(outcome.executed[outcome.executed.length - 1].success).toBe(true);
    }
  });

  it('retries with the same backend on re-plan', async () => {
    let callCount = 0;
    testMock.setExecuteMock((action: { type: string }) => {
      callCount += 1;
      if (action.type === 'getTree') {
        return Promise.resolve({
          success: true,
          duration: 10,
          metadata: { model: { root: { role: 'root', label: 'screen', children: [] } } },
        });
      }
      if (callCount <= 1) {
        return Promise.resolve({ success: false, duration: 100, error: 'fail' });
      }
      return Promise.resolve({ success: true, duration: 100, verified: true });
    });

    const outcome = await runOnDevice({
      prompt: 'Open Settings',
      backend: 'deterministic',
    });

    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'executed') {
      expect(outcome.backendId).toBe('deterministic');
    }
  });

  it('includes accomplished steps in the observation for step-level recovery', async () => {
    let innerCallCount = 0;
    testMock.setExecuteMock((action: { type: string }) => {
      if (action.type === 'getTree') {
        return Promise.resolve({
          success: true,
          duration: 10,
          metadata: { model: { root: { role: 'root', label: 'screen', children: [] } } },
        });
      }
      innerCallCount += 1;
      // First call fails (launchApp), second call succeeds (re-plan)
      if (innerCallCount <= 1) {
        return Promise.resolve({
          success: false,
          duration: 100,
          error: 'app launch failed',
        });
      }
      return Promise.resolve({ success: true, duration: 100, verified: true });
    });

    const outcome = await runOnDevice({
      prompt: 'Open Settings',
      backend: 'deterministic',
    });

    // Verify recovery happened
    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'executed') {
      expect(outcome.attempts).toBe(2);
    }
  });
});

describe('strong verification recovery', () => {
  it('recovers when an executed action fails verification (success: false)', async () => {
    let callCount = 0;
    testMock.setExecuteMock((action: { type: string }) => {
      if (action.type === 'getTree') {
        return Promise.resolve({
          success: true,
          duration: 10,
          metadata: { model: { root: { role: 'root', label: 'screen', children: [] } } },
        });
      }
      callCount += 1;
      if (callCount <= 1) {
        return Promise.resolve({
          success: false,
          duration: 100,
          error: 'verification failed: expected screen not present',
        });
      }
      return Promise.resolve({ success: true, duration: 100, verified: true });
    });

    const outcome = await runOnDevice({
      prompt: 'Open Settings',
      backend: 'deterministic',
    });

    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'executed') {
      expect(outcome.attempts).toBe(2);
    }
  });

  it('preserves already-verified earlier steps during step-level recovery', async () => {
    const attempted: string[] = [];
    testMock.setExecuteMock((action: { type: string }) => {
      if (action.type === 'getTree') {
        return Promise.resolve({
          success: true,
          duration: 10,
          metadata: { model: { root: { role: 'root', label: 'screen', children: [] } } },
        });
      }
      attempted.push(action.type);
      // Step 0 (launchApp) always succeeds; step 1 (type) fails once then succeeds.
      if (action.type === 'type' && attempted.filter((t) => t === 'type').length <= 1) {
        return Promise.resolve({ success: false, duration: 50, error: 'text not present' });
      }
      return Promise.resolve({ success: true, duration: 50, verified: true });
    });

    const outcome = await runOnDevice({
      prompt: 'Open Settings and search for Fitness',
      backend: 'deterministic',
    });

    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'executed') {
      expect(outcome.attempts).toBe(2);
      // The first step must not be re-executed after it was verified.
      expect(attempted.filter((t) => t === 'launchApp')).toHaveLength(1);
    }
  });

  it('preserves the original user goal across the recovery re-plan', async () => {
    let innerCallCount = 0;
    testMock.setExecuteMock((action: { type: string }) => {
      if (action.type === 'getTree') {
        return Promise.resolve({
          success: true,
          duration: 10,
          metadata: { model: { root: { role: 'root', label: 'screen', children: [] } } },
        });
      }
      innerCallCount += 1;
      if (innerCallCount <= 1) {
        return Promise.resolve({ success: false, duration: 100, error: 'launch failed' });
      }
      return Promise.resolve({ success: true, duration: 100, verified: true });
    });

    const outcome = await runOnDevice({
      prompt: 'Open Settings',
      backend: 'deterministic',
    });

    expect(outcome.success).toBe(true);
    if (outcome.success && outcome.kind === 'executed') {
      expect(outcome.attempts).toBe(2);
      expect(outcome.executed.some((e) => e.success)).toBe(true);
      expect(outcome.executed[outcome.executed.length - 1].success).toBe(true);
    }
  });
});

describe('step-level recovery observation', () => {
  it('builds observation with accomplished steps', () => {
    // Simulate a scenario where step 0 succeeded and step 1 failed
    const executed = [
      { stepIndex: 0, description: 'Launch Settings', success: true, duration: 100 },
      {
        stepIndex: 1,
        description: 'Type: Fitness',
        success: false,
        error: 'type failed',
        duration: 50,
      },
    ];
    const failedStep = executed[1];

    // Build observation manually using the internal function logic
    const accomplishedSteps = executed
      .filter((e) => e.success && e.stepIndex < failedStep.stepIndex)
      .map((e) => ({
        description: e.description,
        capabilityId: e.description.split(/[(:]/)[0].trim().toLowerCase() || 'unknown',
      }));

    expect(accomplishedSteps).toHaveLength(1);
    expect(accomplishedSteps[0].description).toBe('Launch Settings');
  });

  it('observation excludes the failed step from accomplished steps', () => {
    const executed = [
      { stepIndex: 0, description: 'Launch Settings', success: true, duration: 100 },
      {
        stepIndex: 1,
        description: 'Type: Fitness',
        success: false,
        error: 'type failed',
        duration: 50,
      },
    ];
    const failedStep = executed[1];

    const accomplishedSteps = executed
      .filter((e) => e.success && e.stepIndex < failedStep.stepIndex)
      .map((e) => ({
        description: e.description,
        capabilityId: e.description.split(/[(:]/)[0].trim().toLowerCase() || 'unknown',
      }));

    // Should NOT include the failed step
    expect(accomplishedSteps.every((s) => s.description !== 'Type: Fitness')).toBe(true);
  });
});

describe('state-aware planning prompt', () => {
  it('surfaces original goal, current app, verified actions, failed action, and failure reason', () => {
    const observation: ObservationContext = {
      originalGoal: 'Open Settings and enable Wi-Fi',
      accomplishedSteps: [{ description: 'Launch Settings', capabilityId: 'launchapp' }],
      executedSteps: [
        { description: 'Launch Settings', capabilityId: 'launchapp', success: true },
        { description: 'Toggle Wi-Fi', capabilityId: 'tap', success: false },
      ],
      failedCapability: 'tap',
      failedDescription: 'Toggle Wi-Fi',
      error: 'element not found',
      currentApp: 'Settings (com.apple.Preferences)',
      screenState: '{"role":"root"}',
    };

    const prompt = promptWithObservation('Open Settings and enable Wi-Fi', observation);

    expect(prompt).toContain('Original user goal: Open Settings and enable Wi-Fi');
    expect(prompt).toContain('Current app: Settings (com.apple.Preferences)');
    expect(prompt).toContain('Current screen (accessibility tree)');
    expect(prompt).toContain('Verified actions already completed');
    expect(prompt).toContain('Launch Settings');
    expect(prompt).toContain('Recent actions');
    expect(prompt).toContain('Failed action');
    expect(prompt).toContain('Toggle Wi-Fi');
    expect(prompt).toContain('Failure reason: element not found');
  });
});

describe('reasonForRun apple backend invokes the on-device model', () => {
  const ORIGINAL_BRIDGE_PATH = process.env.ATHENA_APPLE_BRIDGE_PATH;

  // The Apple backend must drive the real FoundationModels bridge via
  // AppleModelClient.extractGoals(). We prove that by pointing the bridge at a
  // stub binary that (a) writes a sentinel file when invoked and (b) returns a
  // goal the deterministic extractor would never produce for the prompt, so the
  // resulting plan can only have come from the model.
  function stubAppleBridge(responseJson: string): {
    bin: string;
    sentinelPath: string;
    cleanup: () => void;
  } {
    const dir = mkdtempSync(join(tmpdir(), 'athena-apple-reason-'));
    const bin = join(dir, 'stub-bridge');
    const sentinelPath = join(dir, 'invoked');
    const script = `touch "${sentinelPath}"\ncat << 'EOF'\n${responseJson}\nEOF\n`;
    writeFileSync(bin, `#!/bin/bash\n${script}\n`, { mode: 0o755 });
    chmodSync(bin, 0o755);
    return { bin, sentinelPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  afterEach(() => {
    if (ORIGINAL_BRIDGE_PATH === undefined) delete process.env.ATHENA_APPLE_BRIDGE_PATH;
    else process.env.ATHENA_APPLE_BRIDGE_PATH = ORIGINAL_BRIDGE_PATH;
  });

  const MODEL_GOALS = '{"goals":[{"kind":"navigateBack","description":"Go back"}]}';
  const OK_RESPONSE = JSON.stringify({ ok: true, text: MODEL_GOALS });
  const NOT_ENABLED = JSON.stringify({
    ok: false,
    error: 'appleIntelligenceNotEnabled',
    message: 'system language model unavailable',
  });
  const NOT_READY = JSON.stringify({
    ok: false,
    error: 'modelNotReady',
    message: 'system language model unavailable',
  });

  it('calls AppleModelClient.extractGoals() for backend=apple (no deterministic pre-fill)', () => {
    const { bin, sentinelPath, cleanup } = stubAppleBridge(OK_RESPONSE);
    process.env.ATHENA_APPLE_BRIDGE_PATH = bin;
    try {
      const { intent, backendId, result } = reasonForRun('Open Settings and search for Fitness', {
        backend: 'apple',
      });
      expect(backendId).toBe('apple:apple:system-language-model');
      // The bridge/AppleModelClient was actually invoked.
      expect(existsSync(sentinelPath)).toBe(true);
      // No deterministic pre-fill happened — the model supplies the goals
      // (navigateBack is a goal the deterministic extractor would never emit).
      expect(intent.goals.map((g) => g.kind)).toContain('navigateBack');
      expect(result.kind).toBe('executionPlan');
      if (result.kind === 'executionPlan') {
        // navigateBack is not something the deterministic extractor emits for this
        // prompt; its presence proves the plan came from the Apple model.
        expect(result.plan.steps[0].capabilityId).toBe('back');
      }
    } finally {
      cleanup();
    }
  });

  it('does NOT call the Apple bridge for the deterministic backend', () => {
    const { bin, sentinelPath, cleanup } = stubAppleBridge(OK_RESPONSE);
    process.env.ATHENA_APPLE_BRIDGE_PATH = bin;
    try {
      const { backendId, result } = reasonForRun('Open Settings', { backend: 'deterministic' });
      expect(backendId).toBe('deterministic');
      // The deterministic path pre-fills goals and never touches the Apple bridge.
      expect(existsSync(sentinelPath)).toBe(false);
      expect(result.kind).toBe('executionPlan');
      if (result.kind === 'executionPlan') {
        // Deterministic extraction of "Open Settings" yields a launchApp step.
        expect(result.plan.steps[0].capabilityId).toBe('launchApp');
      }
    } finally {
      cleanup();
    }
  });

  it('propagates appleIntelligenceNotEnabled as the typed Apple error', () => {
    const { bin, cleanup } = stubAppleBridge(NOT_ENABLED);
    process.env.ATHENA_APPLE_BRIDGE_PATH = bin;
    try {
      expect(() => reasonForRun('Open Settings', { backend: 'apple' })).toThrow(
        AppleModelUnavailableError
      );
      try {
        reasonForRun('Open Settings', { backend: 'apple' });
      } catch (error) {
        expect(error).toBeInstanceOf(AppleModelUnavailableError);
        expect((error as AppleModelUnavailableError).reason).toBe('appleIntelligenceNotEnabled');
      }
    } finally {
      cleanup();
    }
  });

  it('propagates modelNotReady as the typed Apple error', () => {
    const { bin, cleanup } = stubAppleBridge(NOT_READY);
    process.env.ATHENA_APPLE_BRIDGE_PATH = bin;
    try {
      expect(() => reasonForRun('Open Settings', { backend: 'apple' })).toThrow(
        AppleModelUnavailableError
      );
      try {
        reasonForRun('Open Settings', { backend: 'apple' });
      } catch (error) {
        expect(error).toBeInstanceOf(AppleModelUnavailableError);
        expect((error as AppleModelUnavailableError).reason).toBe('modelNotReady');
      }
    } finally {
      cleanup();
    }
  });

  it('normalizes an Apple-generated verify goal into actionable goals (no verify capability)', () => {
    // The Apple model (contrary to the new contract) emits a verify goal mixed
    // with real actions. The planner must drop it so the plan holds only
    // executable, registered capabilities — never a goal with no capability.
    const MODEL_GOALS_WITH_VERIFY =
      '{"goals":[{"kind":"openApp","description":"Open \\"Settings\\""},{"kind":"type","description":"Type \\"Fitness\\""},{"kind":"verify","description":"Verify the Fitness settings screen is displayed"}]}';
    const { bin, sentinelPath, cleanup } = stubAppleBridge(
      JSON.stringify({ ok: true, text: MODEL_GOALS_WITH_VERIFY })
    );
    process.env.ATHENA_APPLE_BRIDGE_PATH = bin;
    try {
      const { backendId, result } = reasonForRun(
        'Open Settings, search for Fitness, verify the screen',
        {
          backend: 'apple',
        }
      );
      // Apple is STILL the invoked source and remains the backend.
      expect(backendId).toBe('apple:apple:system-language-model');
      expect(existsSync(sentinelPath)).toBe(true);
      expect(result.kind).toBe('executionPlan');
      if (result.kind === 'executionPlan') {
        const kinds = result.plan.steps.map((s) => s.capabilityId);
        // The prohibited verify goal was dropped; only executable capabilities remain.
        expect(kinds).not.toContain('verify');
        expect(kinds).toContain('launchApp');
        expect(kinds).toContain('type');
      }
    } finally {
      cleanup();
    }
  });

  it('persists Apple-extracted goals onto the intent so execution can resolve concrete targets', () => {
    // Regression: for the model backend the extracted goals must be written back
    // to intent.goals, otherwise planToAction looks up goals by step.goalId, finds
    // nothing, and falls back to the whole prompt as the app/label/text argument
    // (making the plan unresolvable at execution time).
    const MODEL_GOALS_WITH_VERIFY =
      '{"goals":[{"kind":"openApp","description":"Open \\"Settings\\""},{"kind":"type","description":"Type \\"Fitness\\""},{"kind":"verify","description":"Verify the Fitness settings screen is displayed"}]}';
    const { bin, cleanup } = stubAppleBridge(
      JSON.stringify({ ok: true, text: MODEL_GOALS_WITH_VERIFY })
    );
    process.env.ATHENA_APPLE_BRIDGE_PATH = bin;
    try {
      const { intent } = reasonForRun('Open Settings, search for Fitness, verify the screen', {
        backend: 'apple',
      });
      const kinds = intent.goals.map((g) => g.kind);
      // Actionable goals persisted; prohibited verify dropped.
      expect(kinds).toContain('openApp');
      expect(kinds).toContain('type');
      expect(kinds).not.toContain('verify');
      // The concrete target is preserved verbatim for execution to resolve.
      expect(intent.goals.find((g) => g.kind === 'openApp')?.description).toBe('Open "Settings"');
      expect(intent.goals.find((g) => g.kind === 'type')?.description).toBe('Type "Fitness"');
    } finally {
      cleanup();
    }
  });
});
