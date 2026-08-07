import { describe, it, expect } from 'vitest';
import type { Capability, CapabilityContext, CapabilityResult } from './capability.js';

describe('Capability contract', () => {
  it('defines the execute/verify/telemetry/rollback shape', () => {
    const fake: Capability = {
      id: 'screenshot',
      execute: async () => ({ success: true }),
      verify: async () => ({
        verified: true,
        strategy: 'file-verified',
        checkedAt: new Date(),
      }),
      telemetry: async () => undefined,
      rollback: async () => undefined,
    };

    expect(fake.id).toBe('screenshot');
    expect(typeof fake.execute).toBe('function');
    expect(typeof fake.verify).toBe('function');
    expect(typeof fake.telemetry).toBe('function');
    expect(fake.rollback).toBeDefined();
  });

  it('rollback is optional (anticipates compensations without requiring them)', () => {
    const minimal: Capability = {
      id: 'launch',
      execute: async () => ({ success: true }),
    };
    expect(minimal.rollback).toBeUndefined();
  });

  it('context carries requestId', async () => {
    const context: CapabilityContext = { requestId: 'req-123', deviceUdid: 'UDID-A' };
    let seen: CapabilityResult | undefined;
    const cp: Capability<CapabilityContext> = {
      id: 'tap',
      execute: async () => {
        seen = { success: true, metadata: { requestId: context.requestId } };
        return seen;
      },
    };
    const result = await cp.execute(context);
    expect(result.success).toBe(true);
    expect(seen?.metadata?.['requestId']).toBe('req-123');
  });
});
