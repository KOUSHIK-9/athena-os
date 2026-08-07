import { describe, expect, it } from 'vitest';
import type { CapabilityDescriptor, CapabilityRegistry, Goal } from '@athena-os/core';
import { DeterministicCapabilityMatcher } from './capabilityMatcher.js';

const openApp: CapabilityDescriptor = {
  id: 'app-launch',
  description: 'Launch an application',
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
  { id: 'g1', kind: 'openApp', description: 'Open Settings' },
  { id: 'g2', kind: 'sendMessage', description: 'Send message to Alice' },
];

describe('DeterministicCapabilityMatcher', () => {
  const matcher = new DeterministicCapabilityMatcher();

  it('matches every goal to a capability that supports its kind', () => {
    const result = matcher.matchGoals(goals, registry(openApp, messaging));
    expect(result.matches).toEqual([openApp, messaging]);
    expect(result.unmatched).toEqual([]);
  });

  it('reports goals without a supporting capability as unmatched', () => {
    const result = matcher.matchGoals(goals, registry(openApp));
    expect(result.matches).toEqual([openApp]);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].goal).toEqual(goals[1]);
    expect(result.unmatched[0].reason).toContain("no registered capability satisfies goal kind 'sendMessage'");
  });

  it('leaves matches empty when no goals are accepted', () => {
    const result = matcher.matchGoals([], registry(openApp));
    expect(result.matches).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });
});
