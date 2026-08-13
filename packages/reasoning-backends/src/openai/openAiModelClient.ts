import type { Intent } from '@athena-os/core';
import type { ModelClient, ModelExtraction } from '../llm/modelClient.js';
import { filterGoalsToContext, goalExtractionInstructions, parseGoalsJson as sharedParseGoalsJson } from '../llm/goalPrompt.js';
import type { ChatCompletionProvider, ChatMessage } from './chatCompletionProvider.js';
import { OpenAICompatibleHttpProvider } from './openAiHttpProvider.js';
import { OpenAIError } from './openAiHttpProvider.js';
import type { OpenAIConfig } from './openAiConfig.js';
import type { ModelExtractionContext } from '../llm/modelClient.js';

/**
 * OpenAI-compatible `ModelClient` (RFC-0012). Owns only the open-ended
 * semantics — turning an intent into kind goals (or asking for more
 * context) — exactly like the in-repo `StubModelClient`, but backed by a
 * remote Chat Completions API through the `ChatCompletionProvider` seam.
 * The core candidate logic shrinks to nothing here: `LlmReasoningBackend`
 * keeps the canonical assembly.
 */

/** Parse a model answer into a `ModelExtraction`; OpenAI-flavored errors. */
export function parseGoalsJson(content: string, intent: Intent): ModelExtraction {
  return sharedParseGoalsJson(content, intent, (message) => new OpenAIError('OUTPUT', message));
}

export class OpenAIModelClient implements ModelClient {
  readonly id: string;

  constructor(
    private readonly config: OpenAIConfig,
    private readonly provider: ChatCompletionProvider = new OpenAICompatibleHttpProvider(config)
  ) {
    this.id = `openai:${config.model}`;
  }

  extractGoals(intent: Intent, context?: ModelExtractionContext): ModelExtraction {
    const system = goalExtractionInstructions(context);
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: intent.text ?? '' },
    ];

    let answer: string;
    try {
      answer = this.provider.complete({
        model: this.config.model,
        messages,
        temperature: 0,
      }).content;
    } catch (error) {
      if (error instanceof OpenAIError) {
        throw error;
      }
      throw new OpenAIError('ROUTER', `OpenAI model call failed: ${String(error)}`);
    }

    const extraction = parseGoalsJson(answer, intent);
    // Registry-aware safety net: keep only goals the active registry can satisfy.
    const goals = filterGoalsToContext(extraction.goals, context);
    if (goals.length === 0 && extraction.goals.length > 0) {
      return {
        goals: [],
        clarification: `extracted goals are not supported by the active registry: ${extraction.goals
          .map((g) => g.kind)
          .join(', ')}`,
      };
    }
    return { ...extraction, goals };
  }
}
