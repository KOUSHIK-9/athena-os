import { describe, expect, it } from 'vitest';
import type { CapabilityDescriptor, CapabilityRegistry, MemoryEntry } from '@athena-os/core';
import { InMemoryStore } from '@athena-os/memory';
import { LlmReasoningBackend } from './LlmReasoningBackend.js';
import type { Intent, ModelClient, ModelExtraction, ModelExtractionContext } from './modelClient.js';

/** A model client that records the context it was called with. */
class CapturingModelClient implements ModelClient {
  readonly id = 'capture';
  capturedContext: ModelExtractionContext | undefined;
  extractGoals(intent: Intent, context?: ModelExtractionContext): ModelExtraction {
    this.capturedContext = context;
    return { goals: [{ kind: 'openApp', description: intent.text ?? '' }] };
  }
}

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

/**
 * Proves the Apple/LLM backend injects retrieved prior memory into the model's
 * extraction context (RFC-0013/0014): memory -> context -> model. This is the
 * hermetic stand-in for the live on-device path — the same `LlmReasoningBackend`
 * code serves the Apple backend, so the captured context is exactly what the
 * on-device FoundationModels bridge would receive.
 */
describe('Apple/LLM backend: retrieved memory reaches model context', () => {
  it('passes retrieved preferences into the model extraction context', () => {
    const store = new InMemoryStore();
    const pref: MemoryEntry = {
      id: 'pref-fitness',
      kind: 'preference',
      subject: 'user.preference.fitness',
      recordedAt: '2026-01-01T00:00:00.000Z',
      payload: { value: 'open Fitness app first' },
    };
    store.record(pref);

    const client = new CapturingModelClient();
    const backend = new LlmReasoningBackend(client);
    backend.memory = store;

    backend.reason(makeIntent('Open Fitness'), registry);

    expect(client.capturedContext).toBeDefined();
    expect(client.capturedContext?.memory?.map((e) => e.id)).toContain('pref-fitness');
  });

  it('sends no memory context when no store is wired', () => {
    const client = new CapturingModelClient();
    const backend = new LlmReasoningBackend(client);
    backend.reason(makeIntent('Open Settings'), registry);
    expect(client.capturedContext?.memory).toBeUndefined();
  });
});
