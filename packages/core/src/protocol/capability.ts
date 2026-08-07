import type { VerificationResult } from './verification.js';

export interface CapabilityContext {
  requestId: string;
  deviceUdid?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface CapabilityResult {
  success: boolean;
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * A unit of user-visible behavior the platform can perform.
 *
 * `rollback` anticipates compensating actions (Browser/Undo, Files/Restore,
 * Draft/Delete-Draft). It is optional and not yet executed by the pipeline.
 */
export interface Capability<C extends CapabilityContext = CapabilityContext> {
  readonly id: string;
  execute(context: C): Promise<CapabilityResult>;
  verify?(context: C, result: CapabilityResult): Promise<VerificationResult>;
  telemetry?(context: C, result: CapabilityResult): Promise<void>;
  rollback?: (context: C, result: CapabilityResult) => Promise<void>;
}
