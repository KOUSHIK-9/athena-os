import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition, ACTION_STATES } from './state.js';

describe('action state machine', () => {
  it('allows valid terminal transitions', () => {
    expect(canTransition('pending', 'running')).toBe(true);
    expect(canTransition('running', 'retrying')).toBe(true);
    expect(canTransition('retrying', 'running')).toBe(true);
    expect(canTransition('running', 'succeeded')).toBe(true);
    expect(canTransition('running', 'failed')).toBe(true);
    expect(canTransition('pending', 'cancelled')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('succeeded', 'running')).toBe(false);
    expect(canTransition('failed', 'retrying')).toBe(false);
    expect(canTransition('cancelled', 'running')).toBe(false);
  });

  it('terminal states are absorbing', () => {
    for (const terminal of ['succeeded', 'failed', 'cancelled'] as const) {
      for (const to of ACTION_STATES) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    }
  });

  it('assertTransition throws on invalid transitions', () => {
    expect(() => assertTransition('pending', 'succeeded')).toThrow();
    expect(() => assertTransition('pending', 'running')).not.toThrow();
  });
});
