import { z } from 'zod';

/**
 * Configuration for the Apple on-device `ModelClient` (FoundationModels
 * SystemLanguageModel via the stdio bridge). Resolved via env vars.
 */

const BRIDGE_PATH_ENV = 'ATHENA_APPLE_BRIDGE_PATH';
const TIMEOUT_MS_ENV = 'ATHENA_APPLE_MODEL_TIMEOUT_MS';
const MAX_TOKENS_ENV = 'ATHENA_APPLE_MAX_TOKENS';
const MAX_PARSE_RETRIES_ENV = 'ATHENA_APPLE_MAX_PARSE_RETRIES';

export const AppleModelConfigSchema = z.object({
  /** Absolute path to the built `apple-model-bridge` executable. */
  bridgePath: z.string().min(1).optional(),
  /** Build the bridge on first use when no binary exists. */
  buildOnDemand: z.boolean().default(true),
  timeoutMs: z.coerce.number().int().positive().default(90000),
  maxTokens: z.coerce.number().int().positive().default(2048),
  /**
   * When the on-device model returns malformed JSON, retry up to this many
   * extra times with a repair instruction instead of surfacing a hard error.
   * Exhaustion degrades to a clarification result. Defaults to 1.
   */
  maxParseRetries: z.coerce.number().int().nonnegative().default(1),
});

export type AppleModelConfig = z.infer<typeof AppleModelConfigSchema>;

export function parseAppleModelConfig(input: unknown): AppleModelConfig {
  return AppleModelConfigSchema.parse(input);
}

export function appleModelConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AppleModelConfig {
  return parseAppleModelConfig({
    bridgePath: env[BRIDGE_PATH_ENV],
    timeoutMs: env[TIMEOUT_MS_ENV],
    maxTokens: env[MAX_TOKENS_ENV],
    maxParseRetries: env[MAX_PARSE_RETRIES_ENV],
  });
}
