import { describe, it, expect } from 'vitest';
import { tapCapability } from './tap.js';
import { typeCapability } from './type.js';
import { fakeDriver, fakeContext, runCapability } from '../testing/mock.js';

describe('Tap Capability', () => {
  it('executes tap with the selector and records it in metadata', async () => {
    const driver = fakeDriver();
    const selector = { type: 'accessibilityId' as const, value: 'btn-settings' };
    const { result, verification } = await runCapability(
      tapCapability,
      fakeContext({
        driver,
        action: { type: 'tap', selector, description: 'Tap Settings' },
      })
    );

    expect(driver.calls).toContain('tap');
    expect(result.metadata?.selector).toEqual(selector);
    expect(verification.strategy).toBe('session-healthy');
    expect(verification.verified).toBe(true);
  });

  it('rejects a tap without a selector', () => {
    expect(() =>
      tapCapability.validate({ type: 'tap', selector: undefined, description: 'bad' })
    ).toThrow(/selector/);
  });
});

describe('Type Capability', () => {
  it('executes type with text', async () => {
    const driver = fakeDriver();
    const { result } = await runCapability(
      typeCapability,
      fakeContext({
        driver,
        action: { type: 'type', text: 'hello', description: 'Type hello' },
      })
    );

    expect(driver.calls).toContain('type');
    expect(result.metadata?.chars).toBe(5);
  });

  it('rejects a type without text', () => {
    expect(() => typeCapability.validate({ type: 'type', text: '', description: 'bad' })).toThrow(
      /text/
    );
  });

  it('verifies text-visible when the typed text appears on screen', async () => {
    const driver = fakeDriver({ sourceContains: async () => true });
    const { result, verification } = await runCapability(
      typeCapability,
      fakeContext({
        driver,
        action: { type: 'type', text: 'Fitness', description: 'Type Fitness' },
      })
    );

    expect(driver.calls).toContain('sourceContains');
    expect(verification.strategy).toBe('text-visible');
    expect(verification.verified).toBe(true);
    expect(result.metadata?.chars).toBe(7);
  });

  it('fails verification when the typed text never appears on screen', async () => {
    const driver = fakeDriver({ sourceContains: async () => false });
    const { verification } = await runCapability(
      typeCapability,
      fakeContext({
        driver,
        action: { type: 'type', text: 'Fitness', description: 'Type Fitness' },
      })
    );

    expect(verification.strategy).toBe('text-visible');
    expect(verification.verified).toBe(false);
  });
});
