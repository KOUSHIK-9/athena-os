import { describe, expect, it } from 'vitest';
import { BUDGETS, computeTimings } from '../src/metrics.js';

describe('cli metrics', () => {
  it('exposes budgets for the core commands', () => {
    expect(BUDGETS.doctor).toBeGreaterThan(0);
    expect(BUDGETS.devices).toBeGreaterThan(0);
    expect(BUDGETS.screenshot).toBeGreaterThan(0);
    expect(BUDGETS.launch).toBeGreaterThan(0);
  });

  it('computes per-step timings and flags over-budget steps', () => {
    const t0 = 1000;
    const steps = [
      { name: 'doctor', start: t0 },
      { name: 'devices', start: t0 + 500 },
      { name: 'launch', start: t0 + 800 },
    ];
    const timings = computeTimings(steps);
    expect(timings[0]).toMatchObject({ name: 'doctor', ms: 500, over: false });
    expect(timings[1]).toMatchObject({ name: 'devices', ms: 300, over: false });
    // launch has no following step → measured to "now"; just assert it is present.
    expect(timings[2].name).toBe('launch');
  });

  it('marks a step over budget when it exceeds its threshold', () => {
    const steps = [{ name: 'screenshot', start: 0 }];
    const realNow = Date.now;
    try {
      // Force a long elapsed window to exceed the 2000ms screenshot budget.
      (Date as unknown as { now: () => number }).now = () => 5000;
      const [shot] = computeTimings(steps);
      expect(shot.over).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });
});
