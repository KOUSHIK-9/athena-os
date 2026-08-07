import { describe, expect, it } from 'vitest';
import { collectRunActions, mapStepToAction } from './planToAction.js';
import type { Intent, PlanStep } from '@athena-os/core';

function makeIntent(goals: Array<{ kind: string; description: string; target?: string }>): Intent {
  return {
    id: 'intent-test',
    text: goals.map((g) => g.description).join(' '),
    goals: goals.map((g, i) => ({
      id: `g${i + 1}`,
      kind: g.kind,
      description: g.description,
      ...(g.target ? { target: g.target } : {}),
    })),
    constraints: [],
  };
}

function step(overrides: Partial<PlanStep>): PlanStep {
  return {
    id: 'step-1',
    goalId: 'g1',
    capabilityId: 'launchApp',
    action: overrides.capabilityId ?? 'launchApp',
    description: 'placeholder',
    dependsOn: [],
    ...overrides,
  };
}

describe('mapStepToAction', () => {
  it('launches a known app by name', () => {
    const intent = makeIntent([
      { kind: 'openApp', description: 'Open Settings', target: 'Settings' },
    ]);
    const mapped = mapStepToAction(step({ capabilityId: 'launchApp', goalId: 'g1' }), intent);

    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.action).toMatchObject({ type: 'launchApp', bundleId: 'com.apple.Preferences' });
    }
  });

  it('passes an explicit bundle id through', () => {
    const intent = makeIntent([
      { kind: 'openApp', description: 'Open com.example.custom', target: 'com.example.custom' },
    ]);
    const mapped = mapStepToAction(step({ capabilityId: 'launchApp', goalId: 'g1' }), intent);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.action).toMatchObject({ bundleId: 'com.example.custom' });
    }
  });

  it('strips a trailing "app" suffix when resolving a known app', () => {
    const intent = makeIntent([{ kind: 'openApp', description: 'launch the settings app' }]);
    const mapped = mapStepToAction(step({ capabilityId: 'launchApp', goalId: 'g1' }), intent);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.action).toMatchObject({ bundleId: 'com.apple.Preferences' });
    }
  });

  it('reports an unknown app as unresolvable', () => {
    const intent = makeIntent([{ kind: 'openApp', description: 'Open Flarbinator' }]);
    const mapped = mapStepToAction(step({ capabilityId: 'launchApp', goalId: 'g1' }), intent);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toContain('Flarbinator');
    }
  });

  it('extracts a quoted element label for taps', () => {
    const intent = makeIntent([{ kind: 'tap', description: 'Tap "Continue"' }]);
    const mapped = mapStepToAction(step({ capabilityId: 'tap', goalId: 'g1' }), intent);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.label).toBe('Continue');
      expect(mapped.action).toMatchObject({ type: 'tap' });
    }
  });

  it('derives a label from an unquoted tap description', () => {
    const intent = makeIntent([{ kind: 'tap', description: 'tap the Continue button' }]);
    const mapped = mapStepToAction(step({ capabilityId: 'tap', goalId: 'g1' }), intent);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.label).toBe('Continue button');
    }
  });

  it('falls back to the raw intent text when the model paraphrased away the target', () => {
    const intent: Intent = {
      id: 'intent-test',
      text: 'Tap the Continue button',
      goals: [{ id: 'g1', kind: 'tap', description: 'Tap click' }],
      constraints: [],
    };
    const mapped = mapStepToAction(step({ capabilityId: 'tap', goalId: 'g1' }), intent);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.label).toBe('Continue button');
    }
  });

  it('resolves the app from the intent text when the goal lost the target', () => {
    const intent: Intent = {
      id: 'intent-test',
      text: 'Open Settings',
      goals: [{ id: 'g1', kind: 'openApp', description: 'Launch the app' }],
      constraints: [],
    };
    const mapped = mapStepToAction(step({ capabilityId: 'launchApp', goalId: 'g1' }), intent);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.action).toMatchObject({ bundleId: 'com.apple.Preferences' });
    }
  });

  it('ignores single-quoted capability metadata in fallback step descriptions', () => {
    const intent: Intent = {
      id: 'intent-test',
      text: 'Tap the Continue button',
      goals: [],
      constraints: [],
    };
    const mapped = mapStepToAction(
      {
        id: 'step-1',
        goalId: 'goal-1',
        capabilityId: 'tap',
        action: 'execute',
        description: "Satisfy 'tap' with 'tap'",
        dependsOn: [],
      },
      intent
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.label).toBe('Continue button');
    }
  });

  it('rejects a tap with no label', () => {
    const intent = makeIntent([{ kind: 'tap', description: 'tap' }]);
    const mapped = mapStepToAction(step({ capabilityId: 'tap', goalId: 'g1' }), intent);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toContain('no element label');
    }
  });

  it('types quoted text', () => {
    const intent = makeIntent([{ kind: 'type', description: 'Type "hello world" into the field' }]);
    const mapped = mapStepToAction(step({ capabilityId: 'type', goalId: 'g1' }), intent);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.action).toMatchObject({ type: 'type', text: 'hello world' });
    }
  });

  it('types unquoted text derived from the description', () => {
    const intent = makeIntent([{ kind: 'type', description: 'Type Athens demo' }]);
    const mapped = mapStepToAction(step({ capabilityId: 'type', goalId: 'g1' }), intent);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.action).toMatchObject({ type: 'type', text: 'Athens demo' });
    }
  });

  it('rejects a type step with no text', () => {
    const intent = makeIntent([{ kind: 'type', description: 'type' }]);
    const mapped = mapStepToAction(step({ capabilityId: 'type', goalId: 'g1' }), intent);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.reason).toContain('no text');
    }
  });

  it('maps system capabilities without params', () => {
    const intent = makeIntent([]);
    for (const capabilityId of ['pressHome', 'back', 'wait', 'screenshot'] as const) {
      const mapped = mapStepToAction(step({ capabilityId, goalId: 'unused' }), intent);
      expect(mapped.ok).toBe(true);
    }
  });

  it('rejects unsupported capability ids', () => {
    const intent = makeIntent([]);
    const mapped = mapStepToAction(step({ capabilityId: 'deepLink', goalId: 'unused' }), intent);
    expect(mapped.ok).toBe(false);
  });
});

describe('collectRunActions', () => {
  it('collects resolvable actions and reports blocked steps separately', () => {
    const intent = makeIntent([
      { kind: 'openApp', description: 'Open Settings', target: 'Settings' },
      { kind: 'tap', description: 'tap "Continue"' },
      { kind: 'openApp', description: 'Open TotallyNotAnApp' },
    ]);
    const steps: PlanStep[] = [
      {
        id: 's1',
        goalId: 'g1',
        capabilityId: 'launchApp',
        action: 'launchApp',
        description: 'Open Settings',
        dependsOn: [],
      },
      {
        id: 's2',
        goalId: 'g2',
        capabilityId: 'tap',
        action: 'tap',
        description: 'tap Continue',
        dependsOn: ['s1'],
      },
      {
        id: 's3',
        goalId: 'g3',
        capabilityId: 'launchApp',
        action: 'launchApp',
        description: 'Open TotallyNotAnApp',
        dependsOn: ['s2'],
      },
    ];

    const { actions, blocked } = collectRunActions(intent, steps);

    expect(actions).toHaveLength(2);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('TotallyNotAnApp');
  });
});
