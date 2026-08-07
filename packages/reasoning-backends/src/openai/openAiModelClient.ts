import type { Intent } from '@athena-os/core';
import { z } from 'zod';
import type { ExtractedGoal, ModelClient, ModelExtraction } from '../llm/modelClient.js';
import type { ChatCompletionProvider, ChatMessage } from './chatCompletionProvider.js';
import { OpenAICompatibleHttpProvider } from './openAiHttpProvider.js';
import { OpenAIError } from './openAiHttpProvider.js';
import type { OpenAIConfig } from './openAiConfig.js';

/**
 * OpenAI-compatible `ModelClient` (RFC-0012). Owns only the open-ended
 * semantics — turning an intent into kind goals (or asking for more
 * context) — exactly like the in-repo `StubModelClient`, but backed by a
 * remote Chat Completions API through the `ChatCompletionProvider` seam.
 * The core candidate logic shrinks to nothing here: `LlmReasoningBackend`
 * keeps the canonical assembly.
 */

const MAX_GOALS = 16;

const GOALS_PAYLOAD_SCHEMA = z.object({
  goals: z
    .array(z.object({ kind: z.string().min(1), description: z.string().default('') }))
    .max(MAX_GOALS),
  clarification: z.string().optional(),
});

const SYSTEM_PROMPT = [
  'You are Athena, a goal extractor for a cognitive execution platform.',
  'Analyze the user intent and return ONLY a JSON object of the form',
  '{"goals":[{"kind":"<goal kind>","description":"<description>"}],"clarification":"<optional reason>"}.',
  'Use a single, concise goal kind per verb phrase. The "description" must',
  "preserve the user's concrete targets verbatim — quoted strings, element",
  'labels, app names and text to enter must appear exactly as the user wrote',
  'them (e.g. "Tap \\"Continue\\"" stays "Tap \\"Continue\\""). Do not paraphrase',
  'away the target. If the intent is ambiguous or',
  'unfulfillable, return {"goals":[],"clarification":"<why>"}.',
].join('\n');

export class OpenAIModelClient implements ModelClient {
  readonly id: string;

  constructor(
    private readonly config: OpenAIConfig,
    private readonly provider: ChatCompletionProvider = new OpenAICompatibleHttpProvider(config)
  ) {
    this.id = `openai:${config.model}`;
  }

  extractGoals(intent: Intent): ModelExtraction {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
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

    return parseGoalsJson(answer, intent);
  }
}

export function parseGoalsJson(content: string, intent: Intent): ModelExtraction {
  let text = content.trim();
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  if (fenced) {
    text = fenced[1].trim();
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new OpenAIError('OUTPUT', `model returned invalid JSON: ${String(error)}`);
  }

  const parsed = GOALS_PAYLOAD_SCHEMA.safeParse(data);
  if (!parsed.success) {
    throw new OpenAIError(
      'OUTPUT',
      `model output failed validation: ${parsed.error.issues.map((issue) => issue.path.join('.') + ' ' + issue.message).join('; ')}`
    );
  }

  const goals: ExtractedGoal[] = parsed.data.goals.map((goal) => ({
    kind: goal.kind,
    description: goal.description.length > 0 ? goal.description : (intent.text ?? ''),
  }));

  if (goals.length === 0) {
    return {
      goals: [],
      clarification: parsed.data.clarification ?? 'the model returned no extractable goals',
    };
  }

  return { goals };
}
