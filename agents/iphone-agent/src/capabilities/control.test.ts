import { describe, it, expect } from 'vitest';
import { scrollCapability } from './scroll.js';
import { homeCapability } from './home.js';
import { backCapability } from './back.js';
import { waitCapability } from './wait.js';
import { fakeDriver, fakeContext, runCapability } from '../testing/mock.js';

describe('Scroll Capability', () => {
  it('executes swipe with direction and distance', async () => {
    const driver = fakeDriver();
    const { result } = await runCapability(
      scrollCapability,
      fakeContext({
        driver,
        action: {
          type: 'swipe',
          direction: 'up',
          distance: 300,
          description: 'Scroll up',
        },
      })
    );

    expect(driver.calls).toContain('swipe');
    expect(result.metadata).toEqual({ direction: 'up', distance: 300 });
  });

  it('rejects a swipe without a direction', () => {
    expect(() =>
      scrollCapability.validate({
        type: 'swipe',
        direction: undefined,
        distance: 100,
        description: 'bad',
      })
    ).toThrow(/direction/);
  });
});

describe('Home Capability', () => {
  it('executes pressHome', async () => {
    const driver = fakeDriver();
    const { verification } = await runCapability(
      homeCapability,
      fakeContext({ driver, action: { type: 'pressHome', description: 'Go home' } })
    );

    expect(driver.calls).toContain('pressHome');
    expect(verification.strategy).toBe('session-healthy');
    expect(verification.verified).toBe(true);
  });
});

describe('Back Capability', () => {
  it('executes back', async () => {
    const driver = fakeDriver();
    const { verification } = await runCapability(
      backCapability,
      fakeContext({ driver, action: { type: 'back', description: 'Go back' } })
    );

    expect(driver.calls).toContain('back');
    expect(verification.strategy).toBe('session-healthy');
    expect(verification.verified).toBe(true);
  });
});

describe('Wait Capability', () => {
  it('executes wait with a duration', async () => {
    const driver = fakeDriver();
    const { result } = await runCapability(
      waitCapability,
      fakeContext({ driver, action: { type: 'wait', duration: 250, description: 'Wait' } })
    );

    expect(driver.calls).toContain('wait');
    expect(result.metadata?.durationMs).toBe(250);
  });

  it('rejects a negative duration', () => {
    expect(() =>
      waitCapability.validate({
        type: 'wait',
        duration: -1,
        description: 'bad',
      })
    ).toThrow(/duration/);
  });
});
