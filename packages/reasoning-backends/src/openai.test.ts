import { describe, expect, it } from 'vitest';
import type { CapabilityRegistry, Intent } from '@athena-os/core';
import { LlmReasoningBackend } from './llm/LlmReasoningBackend.js';
import type { ChatCompletionRequest } from './openai/chatCompletionProvider.js';
import { OpenAIError } from './openai/openAiHttpProvider.js';
import { parseAssistantResult } from './openai/openAiHttpProvider.js';
import { openAIConfigFromEnv, parseOpenAIConfig } from './openai/openAiConfig.js';
import { OpenAIModelClient, parseGoalsJson } from './openai/openAiModelClient.js';

/**
 * OpenAI adapter (RFC-0012): the transport seam is faked — no network, no
 * keys — and the client is exercised exactly like StubModelClient. The HTTP
 * transport itself is exercised only through a mock `fetch` injected into
 * its worker (or via provider-level tests with a stub provider).
 */

const TEST_CONFIG = {
  apiKey: 'test-key',
  model: 'gpt-test',
  baseUrl: 'https://test.example/v1',
  timeoutMs: 1000,
};

function makeClient(provider: (request: ChatCompletionRequest) => string): {
  client: OpenAIModelClient;
  backend: LlmReasoningBackend;
  calls: ChatCompletionRequest[];
} {
  const calls: ChatCompletionRequest[] = [];
  const client = new OpenAIModelClient(TEST_CONFIG, {
    id: 'fake-provider',
    complete(request: ChatCompletionRequest): { content: string } {
      calls.push(request);
      return { content: provider(request) };
    },
  });
  return { client, backend: new LlmReasoningBackend(client), calls };
}

function registry(): CapabilityRegistry {
  return {
    capabilities: () => [
      {
        id: 'photos-manage',
        description: 'Manage photo library',
        goalKinds: ['cleanPhotos'],
        availability: 'available',
        requiresResources: [],
      },
    ],
  };
}

describe('OpenAIModelClient (RFC-0012, PR 3)', () => {
  it('maps a model JSON payload into an execution plan', () => {
    const { backend, calls } = makeClient(() =>
      JSON.stringify({
        goals: [{ kind: 'cleanPhotos', description: 'Delete screenshots older than 30 days' }],
      })
    );

    const result = backend.reason(
      { id: 'intent-openai', text: 'clean my screenshots', goals: [], constraints: [] },
      registry()
    );

    expect(result.kind).toBe('executionPlan');
    if (result.kind !== 'executionPlan') return;
    expect(result.plan.steps.map((step) => step.goalId)).toEqual(['goal-1']);
    expect(calls).toHaveLength(1);
    expect(calls[0].messages[0].role).toBe('system');
    expect(calls[0].messages[1].content).toBe('clean my screenshots');
    expect(calls[0].temperature).toBe(0);
  });

  it('surfaces the model clarification verbatim', () => {
    const { backend } = makeClient(() =>
      JSON.stringify({ goals: [], clarification: 'which library did you mean?' })
    );

    const result = backend.reason(
      { id: 'intent-vague', text: 'clean', goals: [], constraints: [] },
      registry()
    );

    expect(result).toEqual({
      kind: 'clarificationRequired',
      reason: 'which library did you mean?',
    });
  });

  it('rejects invalid model JSON as a typed OpenAIError', () => {
    const { client } = makeClient(() => 'not json at all');

    expect(() => client.extractGoals({ id: 'i', text: 'x', goals: [], constraints: [] })).toThrow(
      OpenAIError
    );
    try {
      client.extractGoals({ id: 'i2', text: 'x', goals: [], constraints: [] });
    } catch (error) {
      expect((error as OpenAIError).code).toBe('OUTPUT');
    }
  });

  it('rejects malformed payloads (missing goals array) with code OUTPUT', () => {
    const { client } = makeClient(() => JSON.stringify({ nonsense: true }));

    try {
      client.extractGoals({ id: 'i', text: 'x', goals: [], constraints: [] });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(OpenAIError);
      expect((error as OpenAIError).code).toBe('OUTPUT');
    }
  });

  it('rejects non-2xx responses from the transport as a typed OpenAIError', () => {
    const failingProvider = {
      id: 'fake-provider',
      complete(): { content: string } {
        throw new OpenAIError('API', 'OpenAI API error (HTTP 401): bad key');
      },
    };
    const client = new OpenAIModelClient(TEST_CONFIG, failingProvider);

    try {
      client.extractGoals({ id: 'i', text: 'x', goals: [], constraints: [] });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(OpenAIError);
      expect((error as OpenAIError).code).toBe('API');
    }
  });

  it('uses the configured model in its id and request model', () => {
    const { client, calls } = makeClient(() => JSON.stringify({ goals: [] }));

    expect(client.id).toBe('openai:gpt-test');
    client.extractGoals({ id: 'i', text: 'x', goals: [], constraints: [] });
    expect(calls[0].model).toBe('gpt-test');
  });

  it('certifies conformance when the model echoes the stub behavior', () => {
    const { client } = makeClient((request) => {
      const intent = request.messages[1].content;
      const goals: Array<{ kind: string; description: string }> = [];
      if (intent.includes('delete')) goals.push({ kind: 'cleanPhotos', description: intent });
      return JSON.stringify({ goals });
    });

    const report = runConformanceWith(client, registry());
    expect(report.passed).toBe(2);
  });

  it('opens the door to an OpenAI key at runtime (env parsing)', () => {
    const config = parseOpenAIConfig({ apiKey: 'sk-test', model: 'gpt-4o-mini' });
    expect(config.model).toBe('gpt-4o-mini');

    const fromEnv = openAIConfigFromEnv({
      ATHENA_OPENAI_API_KEY: 'sk-env',
      ATHENA_OPENAI_MODEL: 'gpt-test-env',
    } as NodeJS.ProcessEnv);
    expect(fromEnv.apiKey).toBe('sk-env');
    expect(fromEnv.model).toBe('gpt-test-env');

    const defaults = parseOpenAIConfig({ apiKey: 'k' });
    expect(defaults.baseUrl).toBe('https://api.openai.com/v1');
    expect(defaults.timeoutMs).toBe(30000);
  });
});

describe('parseGoalsJson (extraction edge cases)', () => {
  const intent: Intent = { id: 'i', text: 'do the thing', goals: [], constraints: [] };

  it('strips markdown fences', () => {
    const extraction = parseGoalsJson(
      '```json\n{"goals":[{"kind":"cleanPhotos","description":"d"}],"clarification":"c"}\n```',
      intent
    );
    expect(extraction.goals).toEqual([{ kind: 'cleanPhotos', description: 'd' }]);
    expect(extraction.clarification).toBeUndefined();
  });

  it('falls back to the intent text as description when empty', () => {
    const extraction = parseGoalsJson(
      '{"goals":[{"kind":"cleanPhotos","description":""}]}',
      intent
    );
    expect(extraction.goals[0].description).toBe('do the thing');
  });
});

describe('parseAssistantResult (provider → content + usage)', () => {
  it('extracts content and usage from a realistic OpenAI body', () => {
    const result = parseAssistantResult(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: '{"goals":[]}' } }],
        usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 },
      })
    );
    expect(result.content).toBe('{"goals":[]}');
    expect(result.usage).toEqual({ promptTokens: 42, completionTokens: 7 });
  });

  it('returns no usage when the endpoint omits it', () => {
    const result = parseAssistantResult(
      JSON.stringify({ choices: [{ message: { content: 'x' } }] })
    );
    expect(result.content).toBe('x');
    expect(result.usage).toBeUndefined();
  });

  it('returns the raw body verbatim when it is not JSON', () => {
    const result = parseAssistantResult('plain text response');
    expect(result.content).toBe('plain text response');
    expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
  });
});

function runConformanceWith(
  client: OpenAIModelClient,
  _registry: CapabilityRegistry
): { passed: number } {
  // Hermetic harness reuse: run the same behavioral canon through the client.
  // (Kept local to avoid coupling this suite to conformance internals.)
  const backend = new LlmReasoningBackend(client);
  const checks: Array<{ intent: Intent; expectPlan: boolean }> = [
    {
      intent: { id: 'c1', text: 'delete my screenshots', goals: [], constraints: [] },
      expectPlan: true,
    },
    {
      intent: { id: 'c2', text: 'tidy the photo library', goals: [], constraints: [] },
      expectPlan: false,
    },
  ];
  const passed = checks.filter((check) => {
    const result = backend.reason(check.intent, _registry);
    return (result.kind === 'executionPlan') === check.expectPlan;
  }).length;
  return { passed };
}
