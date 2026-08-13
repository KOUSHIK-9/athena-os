import { describe, expect, it } from 'vitest';
import type {
  CapabilityDescriptor,
  CapabilityRegistry,
  Intent,
  MemoryEntry,
} from '@athena-os/core';
import { InMemoryStore } from '@athena-os/memory';
import {
  DeterministicExecutionGraphBuilder,
  DeterministicPlanValidator,
  DeterministicReasoningBackend,
  DeterministicSimulator,
  ReasoningEngine,
} from './index.js';

const registry: CapabilityRegistry = {
  capabilities: (): CapabilityDescriptor[] => [
    {
      id: 'launchApp',
      description: 'Launch a device app by name',
      goalKinds: ['openApp', 'open', 'launch'],
      availability: 'available',
      requiresResources: [],
    },
  ],
};

function makeIntent(text: string): Intent {
  return { id: `intent-${Math.random().toString(36).slice(2)}`, text, goals: [], constraints: [] };
}

function engineWith(memory?: InMemoryStore): ReasoningEngine {
  return new ReasoningEngine(registry, {
    backend: new DeterministicReasoningBackend(),
    planValidator: new DeterministicPlanValidator(),
    simulator: new DeterministicSimulator(),
    executionGraphBuilder: new DeterministicExecutionGraphBuilder(),
    ...(memory ? { memory } : {}),
  });
}

describe('Memory → ReasoningBackend handoff (RFC-0013 §The Contract)', () => {
  it('retrieves prior facts/preferences and surfaces them in the result', () => {
    const store = new InMemoryStore();
    const pref: MemoryEntry = {
      id: 'pref-seat',
      kind: 'preference',
      subject: 'user.seat',
      recordedAt: '2026-01-01T00:00:00.000Z',
      payload: { value: 'window' },
    };
    store.record(pref);

    const result = engineWith(store).reason(makeIntent('Open Settings'));

    expect(result.kind).toBe('executionPlan');
    if (result.kind === 'executionPlan') {
      expect(result.retrievedMemory).toBeDefined();
      expect(result.retrievedMemory!.map((e) => e.id)).toContain('pref-seat');
    }
  });

  it('omits retrievedMemory when no memory is wired', () => {
    const result = engineWith().reason(makeIntent('Open Settings'));

    expect(result.kind).toBe('executionPlan');
    if (result.kind === 'executionPlan') {
      expect(result.retrievedMemory).toBeUndefined();
    }
  });
});
