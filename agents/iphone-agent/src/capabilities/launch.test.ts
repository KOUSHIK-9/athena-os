import { describe, it, expect } from 'vitest';
import { launchCapability } from './launch.js';
import { terminateCapability } from './terminate.js';
import { fakeDriver, fakeContext, runCapability } from '../testing/mock.js';

describe('Launch Capability', () => {
  it('executes launchApp on the driver', async () => {
    const driver = fakeDriver();
    const { result, verification } = await runCapability(
      launchCapability,
      fakeContext({
        driver,
        action: {
          type: 'launchApp',
          bundleId: 'com.apple.settings',
          description: 'Launch Settings',
        },
      })
    );

    expect(driver.calls).toContain('launchApp');
    expect(result).toEqual({});
    expect(verification.verified).toBe(true);
    expect(verification.strategy).toBe('launch-acknowledged');
  });

  it('rejects an action without a bundleId', async () => {
    const driver = fakeDriver();
    expect(() =>
      launchCapability.validate({
        type: 'launchApp',
        bundleId: '',
        description: 'bad',
      })
    ).toThrow(/bundleId/);
    expect(driver.calls).not.toContain('launchApp');
  });

  it('verifies session-active when verifyAppLaunch is enabled', async () => {
    const { verification } = await runCapability(
      launchCapability,
      fakeContext({
        action: {
          type: 'launchApp',
          bundleId: 'com.apple.settings',
          description: 'Launch Settings',
        },
        config: {
          ...fakeContext().config,
          verifyAppLaunch: true,
        },
      })
    );
    expect(verification.strategy).toBe('session-active');
    expect(verification.verified).toBe(true);
  });
});

describe('Terminate Capability', () => {
  it('executes terminateApp on the driver', async () => {
    const driver = fakeDriver();
    const { result } = await runCapability(
      terminateCapability,
      fakeContext({
        driver,
        action: {
          type: 'terminateApp',
          bundleId: 'com.apple.settings',
          description: 'Terminate Settings',
        },
      })
    );

    expect(driver.calls).toContain('terminateApp');
    expect(result).toEqual({});
  });

  it('rejects an action without a bundleId', () => {
    expect(() =>
      terminateCapability.validate({
        type: 'terminateApp',
        bundleId: '',
        description: 'bad',
      })
    ).toThrow(/bundleId/);
  });
});
