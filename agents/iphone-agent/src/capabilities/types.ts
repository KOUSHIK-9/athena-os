import type { Action, Session, SessionConfig, VerificationResult } from '@athena-os/core';
import type { Driver } from '@athena-os/driver';

export type ActionKind = Action['type'];

export interface CapabilityRunContext {
  requestId: string;
  action: Action;
  driver: Driver;
  session: Session;
  config: SessionConfig;
}

export interface CapabilityResultPayload {
  metadata?: Record<string, unknown>;
  screenshot?: string;
}

export interface Capability {
  readonly id: string;
  readonly kinds: ReadonlyArray<ActionKind>;
  validate(action: Action): void;
  execute(ctx: CapabilityRunContext): Promise<CapabilityResultPayload>;
  verify(ctx: CapabilityRunContext, result: CapabilityResultPayload): Promise<VerificationResult>;
  telemetry?(ctx: CapabilityRunContext, result: CapabilityResultPayload): void | Promise<void>;
  rollback?(ctx: CapabilityRunContext, result: CapabilityResultPayload): void | Promise<void>;
}

export function sessionHealthyVerification(
  healthy: boolean,
  sessionId?: string
): VerificationResult {
  return {
    verified: healthy,
    strategy: 'session-healthy',
    details: { sessionId },
    checkedAt: new Date(),
  };
}

export function assertKind(capability: Capability, action: Action): void {
  if (!capability.kinds.includes(action.type)) {
    throw new Error(`Capability '${capability.id}' does not support action '${action.type}'`);
  }
}
