import type { Intent } from '@athena-os/core';
import type { ModelClient, ModelExtraction, ModelExtractionContext } from '../llm/modelClient.js';
import { filterGoalsToContext, goalExtractionInstructions, parseGoalsJson } from '../llm/goalPrompt.js';
import { appleModelConfigFromEnv, type AppleModelConfig } from './appleModelConfig.js';
import { runAppleBridge, type AppleBridgeResult } from './appleModelBridge.js';

/**
 * Apple on-device `ModelClient` (RFC-0012 #port). Same open-ended
 * semantics as `OpenAIModelClient` — an intent becomes kind goals — but
 * the model call happens through the FoundationModels stdio bridge:
 * the Apple SystemLanguageModel running entirely on this machine.
 *
 * Network: none. When the model is not available (Apple Intelligence
 * disabled, device ineligible, model assets not ready) the bridge
 * reports a typed reason instead of falling back silently.
 */

export class AppleModelClient implements ModelClient {
  readonly id: string;

  constructor(private readonly config: AppleModelConfig = appleModelConfigFromEnv()) {
    this.id = 'apple:system-language-model';
  }

  extractGoals(intent: Intent, context?: ModelExtractionContext): ModelExtraction {
    const baseInstructions = goalExtractionInstructions(context);
    const maxAttempts = 1 + Math.max(0, this.config.maxParseRetries ?? 0);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const instructions =
        attempt === 0 ? baseInstructions : repairInstructions(baseInstructions, lastError?.message);

      const result = runAppleBridge(
        {
          prompt: intent.text ?? '',
          instructions,
          maxTokens: this.config.maxTokens,
        },
        this.config
      );

      if (!result.ok) {
        throw new AppleModelUnavailableError(result.error, result.message);
      }

      try {
        const extraction = parseGoalsJson(result.text, intent);
        // Registry-aware safety net: keep only goals the active registry can
        // satisfy. If the model invented kinds (e.g. decomposed a high-level
        // intent into tap/type with no capability), drop them rather than let
        // the matcher reject the whole plan.
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
      } catch (error) {
        // Malformed JSON from the on-device model: retry with a repair
        // instruction rather than failing the whole run.
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    // Exhausted retries: degrade to a clarification request instead of a hard
    // error so the runner can re-plan or ask the user, rather than crashing.
    return {
      goals: [],
      clarification: `Apple on-device model returned invalid JSON after ${maxAttempts} attempts (${
        lastError?.message ?? 'parse error'
      })`,
    };
  }
}

/**
 * Append a concise repair directive to the extraction instructions for retry
 * attempts, telling the model to emit a single valid JSON object and surfacing
 * the previous parser error so it can self-correct.
 */
function repairInstructions(base: string, error?: string): string {
  const note = [
    '',
    'IMPORTANT: your previous response was not valid JSON and could not be parsed.',
    'Respond with ONLY a single valid JSON object and nothing else — no prose, no comments, no trailing characters.',
    error ? `Previous parser error: ${error.slice(0, 300)}` : '',
  ].filter(Boolean);
  return `${base}\n${note.join('\n')}`;
}

export class AppleModelUnavailableError extends Error {
  constructor(
    readonly reason: string,
    detail: string
  ) {
    super(`Apple on-device model unavailable (${reason}): ${detail}`);
    this.name = 'AppleModelUnavailableError';
  }
}
