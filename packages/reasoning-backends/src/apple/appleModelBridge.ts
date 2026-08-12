import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AppleModelConfig } from './appleModelConfig.js';

/**
 * Bridge to the Swift `apple-model-bridge` executable (FoundationModels,
 * SystemLanguageModel). One JSON request per invocation over stdio, as
 * the on-device model is a local resource — no network involved.
 */

export interface AppleBridgeRequest {
  prompt: string;
  instructions?: string;
  maxTokens?: number;
}

export interface AppleBridgeSuccess {
  ok: true;
  text: string;
}

export interface AppleBridgeFailure {
  ok: false;
  error: string;
  message: string;
}

export type AppleBridgeResult = AppleBridgeSuccess | AppleBridgeFailure;

export class AppleBridgeError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'AppleBridgeError';
  }
}

const DEFAULT_BINARY_REL = join('apple', 'bin', 'apple-model-bridge');

function resolveBinaryPath(config: AppleModelConfig): string {
  if (config.bridgePath) return config.bridgePath;
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, '..', '..', DEFAULT_BINARY_REL);
}

function buildOnDemand(binary: string): void {
  const swiftDir = dirname(dirname(dirname(binary)));
  const buildScript = join(swiftDir, 'apple', 'build.sh');
  if (!existsSync(buildScript)) {
    throw new AppleBridgeError(
      `apple-model-bridge binary missing at ${binary} and build script not found at ${buildScript}`,
      'BRIDGE_MISSING'
    );
  }
  const built = spawnSync('bash', [buildScript], { encoding: 'utf8', timeout: 120000 });
  if (built.status !== 0 || !existsSync(binary)) {
    throw new AppleBridgeError(
      `apple-model-bridge build failed: ${built.stderr ?? built.stdout ?? 'unknown error'}`,
      'BRIDGE_BUILD_FAILED'
    );
  }
}

export function runAppleBridge(
  request: AppleBridgeRequest,
  config: AppleModelConfig
): AppleBridgeResult {
  const binary = resolveBinaryPath(config);
  if (!existsSync(binary) && config.buildOnDemand) {
    buildOnDemand(binary);
  }
  if (!existsSync(binary)) {
    throw new AppleBridgeError(
      `apple-model-bridge binary not found at ${binary} (set ATHENA_APPLE_BRIDGE_PATH to override)`,
      'BRIDGE_MISSING'
    );
  }

  const result = spawnSync(binary, [], {
    input: JSON.stringify(request),
    encoding: 'utf8',
    timeout: config.timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      throw new AppleBridgeError('apple-model-bridge timed out', 'BRIDGE_TIMEOUT');
    }
    throw new AppleBridgeError(
      `apple-model-bridge failed to start: ${result.error.message}`,
      'BRIDGE_SPAWN'
    );
  }
  if (result.status !== 0) {
    throw new AppleBridgeError(
      `apple-model-bridge exited ${result.status}: ${result.stderr?.trim() ?? ''}`,
      'BRIDGE_EXIT'
    );
  }

  const stdout = result.stdout?.trim() ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new AppleBridgeError(
      `apple-model-bridge returned non-JSON output: ${stdout.slice(0, 200)} (${String(error)})`,
      'BRIDGE_OUTPUT'
    );
  }

  const out = parsed as Partial<AppleBridgeResult>;
  if (out.ok === true && typeof out.text === 'string') {
    return { ok: true, text: out.text };
  }
  if (out.ok === false && typeof out.error === 'string') {
    return { ok: false, error: out.error, message: out.message ?? '' };
  }
  throw new AppleBridgeError(
    `unrecognized bridge response: ${stdout.slice(0, 200)}`,
    'BRIDGE_OUTPUT'
  );
}
