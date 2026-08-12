import type { Session, SessionConfig } from '@athena-os/core';
import type { Driver } from '@athena-os/driver';
import type { CapabilityRunContext, CapabilityResultPayload } from '../capabilities/types.js';

/** Minimal fake driver recording every invoked method name. */
export function fakeDriver(overrides: Partial<Driver> = {}): Driver & { calls: string[] } {
  const calls: string[] = [];
  const defaults: Record<string, unknown> = {
    async createSession() {
      return { platformName: 'iOS', platformVersion: '18.0', deviceName: 'iPhone', udid: 'UDID' };
    },
    async closeSession() {},
    async launchApp() {},
    async terminateApp() {},
    async tap() {},
    async type() {},
    async swipe() {},
    async screenshot() {
      return Buffer.from('fake');
    },
    async getUITree() {
      return { type: 'XCUIElementTypeApplication', children: [] };
    },
    async getActiveApp() {
      return undefined;
    },
    async sourceContains() {
      return true;
    },
    async pressHome() {},
    async back() {},
    async wait() {},
    async getDeviceInfo() {
      return {
        udid: 'UDID',
        name: 'iPhone',
        model: 'iPhone18',
        osVersion: '18.0',
        isSimulator: false,
        developerMode: true,
      };
    },
    isSessionActive() {
      return true;
    },
  };
  const driver = new Proxy({ ...defaults } as unknown as Driver, {
    get(target, prop, receiver) {
      if (prop === 'calls') return calls;
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          calls.push(String(prop));
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    },
  });
  Object.assign(driver, overrides);
  return driver as Driver & { calls: string[] };
}

export function fakeContext(overrides: Partial<CapabilityRunContext> = {}): CapabilityRunContext {
  const session: Session = {
    id: 'session-1',
    deviceUdid: 'UDID',
    capabilities: {
      platformName: 'iOS',
      platformVersion: '18.0',
      deviceName: 'iPhone',
      udid: 'UDID',
    },
    createdAt: new Date(),
    lastActivity: new Date(),
  };
  const config: SessionConfig = {
    deviceUdid: 'UDID',
    timeout: 30000,
    retries: 3,
    screenshotOnFailure: true,
    screenshotDir: '/tmp/screenshots',
    verifyAppState: false,
    verifyAppLaunch: false,
  };
  return {
    requestId: 'req-1',
    action: { type: 'wait', duration: 0, description: 'noop' },
    driver: fakeDriver(),
    session,
    config,
    ...overrides,
  };
}

export async function runCapability(
  capability: {
    execute(ctx: CapabilityRunContext): Promise<CapabilityResultPayload>;
    verify(
      ctx: CapabilityRunContext,
      result: CapabilityResultPayload
    ): Promise<{ verified: boolean; strategy: string }>;
  },
  ctx: CapabilityRunContext
) {
  const result = await capability.execute(ctx);
  const verification = await capability.verify(ctx, result);
  return { result, verification };
}
