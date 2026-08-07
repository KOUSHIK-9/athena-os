import { describe, expect, it } from 'vitest';
import type { CapabilityDescriptor, CapabilityRegistry, Intent } from '@athena-os/core';
import { DeterministicReasoningBackend } from '@athena-os/reasoning';
import { runConformance, runParity } from './conformance/harness.js';
import { behavioralScenarios } from './conformance/fixtures/behavioral.js';
import { parityScenarios } from './conformance/fixtures/parity.js';
import { LlmReasoningBackend } from './llm/LlmReasoningBackend.js';
import type { ExtractedGoal, ModelClient, ModelExtraction } from './llm/modelClient.js';
import { StubModelClient } from './llm/stubModelClient.js';

/**
 * RFC-0012 §Reference Implementation: the first model-backed backend.
 * All tests run against the in-repo StubModelClient — no API, no keys,
 * fully hermetic. The port (`ModelClient`) is what a future real provider
 * implements; this suite certifies the backend the same way it certifies
 * the deterministic reference.
 */

function makeLlm(modelClient: ModelClient): LlmReasoningBackend {
  return new LlmReasoningBackend(modelClient);
}

describe('LlmReasoningBackend conformance (RFC-0012, PR 3)', () => {
  it('certifies on parity: reproduces every deterministic fixture exactly', () => {
    const report = runConformance(makeLlm(new StubModelClient()), parityScenarios);

    expect(report.backendId).toBe('llm:stub');
    expect(report.total).toBe(parityScenarios.length);
    expect(report.passed).toBe(parityScenarios.length);
    expect(report.failed).toBe(0);
  });

  it('certifies on behavioral: passes the authored canons the deterministic engine cannot', () => {
    const llmReport = runConformance(makeLlm(new StubModelClient()), behavioralScenarios);
    expect(llmReport.passed).toBe(behavioralScenarios.length);
    expect(llmReport.failed).toBe(0);

    const deterministicReport = runConformance(
      new DeterministicReasoningBackend(),
      behavioralScenarios
    );
    expect(deterministicReport.passed).toBe(0);
    expect(
      deterministicReport.results.every((result) => result.actual?.kind === 'clarificationRequired')
    ).toBe(true);
  });

  it('agrees with the deterministic backend on every parity scenario (two backends, one answer)', () => {
    const report = runParity(
      makeLlm(new StubModelClient()),
      new DeterministicReasoningBackend(),
      parityScenarios
    );

    expect(report.failed).toBe(0);
    expect(report.passed).toBe(parityScenarios.length);
  });

  it('honors structured goals verbatim without consulting the model', () => {
    const refusingModel: ModelClient = {
      id: 'refuses',
      extractGoals(): ModelExtraction {
        return { goals: [], clarification: 'I refuse to interpret anything' };
      },
    };

    const intent: Intent = {
      id: 'intent-photo-cleanup',
      goals: [
        { id: 'g1', kind: 'connectService', description: 'Disconnect the photo service' },
        { id: 'g2', kind: 'cleanPhotos', description: 'Delete screenshots older than 30 days' },
      ],
      constraints: [],
    };

    const result = makeLlm(refusingModel).reason(intent, photoCleanupRegistry());

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;
    expect(result.plan.steps.map((step) => step.goalId)).toEqual(['g1', 'g2']);
  });

  it('returns the model clarification when the model cannot extract goals', () => {
    const unsureModel: ModelClient = {
      id: 'unsure',
      extractGoals(): ModelExtraction {
        return { goals: [], clarification: 'the phrasing is ambiguous' };
      },
    };

    const result = makeLlm(unsureModel).reason(
      { id: 'intent-vague', text: 'hmm', goals: [], constraints: [] },
      photoCleanupRegistry()
    );

    expect(result).toEqual({
      kind: 'clarificationRequired',
      reason: 'the phrasing is ambiguous',
    });
  });

  it('exposes the model port: a different client changes what the backend understands', () => {
    const messengerModel: ModelClient = {
      id: 'always-message',
      extractGoals(intent: Intent): ModelExtraction {
        const goal: ExtractedGoal = {
          kind: 'sendMessage',
          description: intent.text ?? '',
        };
        return { goals: [goal] };
      },
    };

    const registry: CapabilityRegistry = {
      capabilities: () =>
        [
          { id: 'messages-send', description: 'Send a message', goalKinds: ['sendMessage'] },
        ] satisfies CapabilityDescriptor[],
    };

    const result = makeLlm(messengerModel).reason(
      { id: 'intent-anything', text: 'anything at all', goals: [], constraints: [] },
      registry
    );

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;
    expect(result.plan.steps[0].capabilityId).toBe('messages-send');
  });
});

function photoCleanupRegistry(): CapabilityRegistry {
  return {
    capabilities: () => [
      {
        id: 'photos-manage',
        description: 'Manage photo library',
        goalKinds: ['cleanPhotos', 'connectService'],
        availability: 'available',
        requiresResources: [],
      },
    ],
  };
}
