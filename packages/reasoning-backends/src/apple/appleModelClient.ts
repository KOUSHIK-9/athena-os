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
    const instructions = goalExtractionInstructions(context);
    const result = runAppleBridge(
      {
        prompt: intent.text ?? '',
        instructions,
        maxTokens: this.config.maxTokens,
      },
      this.config
    );

    const bridge = result as AppleBridgeResult;
    if (!bridge.ok) {
      throw new AppleModelUnavailableError(bridge.error, bridge.message);
    }

    const extraction = parseGoalsJson(bridge.text, intent);
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
  }
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
