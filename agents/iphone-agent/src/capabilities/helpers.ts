import type { Action, VerificationResult } from '@athena-os/core';
import { createVerificationResult } from '@athena-os/core';
import { toAthenaError } from '@athena-os/shared';
import type { Capability, CapabilityRunContext, CapabilityResultPayload } from './types.js';

interface CapabilityArgs {
  id: string;
  kinds: Capability['kinds'];
  validate: (action: Action) => void;
  execute: (
    ctx: CapabilityRunContext
  ) => Promise<CapabilityResultPayload> | CapabilityResultPayload;
  verify?: (
    ctx: CapabilityRunContext,
    result: CapabilityResultPayload
  ) => Promise<VerificationResult> | VerificationResult;
  telemetry?: (ctx: CapabilityRunContext, result: CapabilityResultPayload) => void | Promise<void>;
  rollback?: (ctx: CapabilityRunContext, result: CapabilityResultPayload) => void | Promise<void>;
}

export function createCapability(args: CapabilityArgs): Capability {
  return {
    id: args.id,
    kinds: args.kinds,
    validate: args.validate,
    execute: async (ctx) => {
      try {
        return await args.execute(ctx);
      } catch (error) {
        throw toAthenaError(error);
      }
    },
    verify: args.verify
      ? async (ctx, result) => {
          try {
            return await args.verify!(ctx, result);
          } catch (error) {
            throw toAthenaError(error);
          }
        }
      : (ctx) =>
          Promise.resolve(
            createVerificationResult('session-healthy', Boolean(ctx.session), {
              sessionId: ctx.session?.id,
            })
          ),
    telemetry: args.telemetry,
    rollback: args.rollback,
  };
}
