import { describe, expect, it } from 'vitest';
import type { CapabilityDescriptor, CapabilityRegistry, Goal } from '@athena-os/core';
import { DeterministicCapabilityMatcher, selectCapabilities } from './capabilityMatcher.js';

const openApp: CapabilityDescriptor = {
  id: 'app-launch',
  description: 'Launch an application',
  goalKinds: ['openApp'],
};

const activateApp: CapabilityDescriptor = {
  id: 'app-activate',
  description: 'Activate an already-running application',
  goalKinds: ['openApp'],
};

const messaging: CapabilityDescriptor = {
  id: 'messages-send',
  description: 'Send a message',
  goalKinds: ['sendMessage'],
};

function registry(...capabilities: CapabilityDescriptor[]): CapabilityRegistry {
  return { capabilities: () => capabilities };
}

const goals: Goal[] = [
  { id: 'g1', kind: 'openApp', description: 'Open Camera', target: 'Camera' },
  { id: 'g2', kind: 'sendMessage', description: 'Send message to Alice', target: 'Alice' },
];

describe('DeterministicCapabilityMatcher', () => {
  const matcher = new DeterministicCapabilityMatcher();

  it('returns every candidate capability for each goal, with reasons', () => {
    const result = matcher.matchGoals([goals[0]], registry(openApp, activateApp));

    expect(result.unmatched).toEqual([]);
    expect(result.goals).toHaveLength(1);
    const options = result.goals[0];
    expect(options.goal).toEqual(goals[0]);
    expect(options.candidates.map((c) => c.capability.id)).toEqual([
      'app-launch',
      'app-activate',
    ]);
    expect(options.candidates[0].reason).toContain("declares goal kind 'openApp'");
  });

  it('reports goals without a supporting capability as unmatched', () => {
    const result = matcher.matchGoals(goals, registry(openApp));
    expect(result.goals).toHaveLength(1);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].goal).toEqual(goals[1]);
    expect(result.unmatched[0].reason).toContain("no registered capability satisfies goal kind 'sendMessage'");
  });

  it('leaves candidates empty when no goals are accepted', () => {
    const result = matcher.matchGoals([], registry(openApp));
    expect(result.goals).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });
});

describe('selectCapabilities', () => {
  const matcher = new DeterministicCapabilityMatcher();

  it('selects the first candidate per goal (deterministic, registry order)', () => {
    const result = matcher.matchGoals([goals[0]], registry(openApp, activateApp));
    const selection = selectCapabilities(result);

    expect(selection.unresolved).toEqual([]);
    expect(selection.selections).toHaveLength(1);
    expect(selection.selections[0].capability.id).toBe('app-launch');
    expect(selection.selections[0].reason).toContain('app-launch');
  });

  it('does not fail when multiple goals share a candidate set', () => {
    const result = matcher.matchGoals(goals, registry(openApp, messaging));
    const selection = selectCapabilities(result);

    expect(selection.selections).toHaveLength(2);
    expect(selection.selections.map((s) => s.capability.id)).toEqual([
      'app-launch',
      'messages-send',
    ]);
  });
});