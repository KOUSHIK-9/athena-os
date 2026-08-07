import { z } from 'zod';

/**
 * Configuration for the OpenAI-compatible `ModelClient`. Resolved via env
 * vars or an explicit object; the API key is never logged or persisted.
 */

const API_KEY_ENV = 'ATHENA_OPENAI_API_KEY';
const MODEL_ENV = 'ATHENA_OPENAI_MODEL';
const BASE_URL_ENV = 'ATHENA_OPENAI_BASE_URL';
const TIMEOUT_MS_ENV = 'ATHENA_OPENAI_TIMEOUT_MS';

export const OpenAIConfigSchema = z.object({
  apiKey: z.string().min(1, { message: 'ATHENA_OPENAI_API_KEY is not set' }),
  model: z.string().min(1).default('gpt-4o-mini'),
  baseUrl: z.string().url().default('https://api.openai.com/v1'),
  timeoutMs: z.coerce.number().int().positive().default(30000),
});

export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

export function parseOpenAIConfig(input: unknown): OpenAIConfig {
  return OpenAIConfigSchema.parse(input);
}

export function openAIConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OpenAIConfig {
  return parseOpenAIConfig({
    apiKey: env[API_KEY_ENV] ?? '',
    model: env[MODEL_ENV],
    baseUrl: env[BASE_URL_ENV],
    timeoutMs: env[TIMEOUT_MS_ENV],
  });
}
