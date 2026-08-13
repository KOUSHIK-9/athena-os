import { describe, expect, it } from 'vitest';
import type { MemoryEntry } from '@athena-os/core';
import { InMemoryStore } from '@athena-os/memory';
import { reasonForRun, type ReasonOptions } from './reason.js';
import { runOnDevice } from './execute.js';
import type { RunReasoning } from './reason.js';

/**
 * Live Apple on-device memory scenario.
 *
 * Proves the full product loop on a real iPhone 17 Simulator / device:
 *
 *   memory written (preference)
 *     → memory retrieved into the Apple model context
 *     → Apple on-device model reasons with that context
 *     → validated execution plan
 *     → actual simulator result
 *     → experience written back into memory
 *
 * Gated behind ATHENA_REAL_DEVICE=1 (and ATHENA_APPLE_MODEL=1) so it is skipped
 * cleanly in CI / headless environments. The hermetic equivalent of the
 * "model receives memory context" step lives in
 * packages/reasoning-backends/src/llm/memoryContext.test.ts.
 */
const ENABLED = process.env.ATHENA_REAL_DEVICE === '1' && process.env.ATHENA_APPLE_MODEL === '1';

describe('Live Apple memory loop (iPhone 17 Simulator)', () => {
  it.skipIf(!ENABLED)('remembers a preference and reasons with it on-device', async () => {
    const store = new InMemoryStore();
    const pref: MemoryEntry = {
      id: 'pref-fitness',
      kind: 'preference',
      subject: 'user.preference.fitness',
      recordedAt: new Date().toISOString(),
      payload: { value: 'open Fitness app first' },
    };
    store.record(pref);

    // Capture what the run layer retrieves so we can assert the read path too.
    let captured: RunReasoning | undefined;
    const capturingReason = (prompt: string, options?: ReasonOptions): RunReasoning => {
      const result = reasonForRun(prompt, options);
      captured = result;
      return result;
    };

    const outcome = await runOnDevice(
      { prompt: 'Open my Fitness settings', backend: 'apple', memory: store },
      capturingReason
    );

    // Memory was retrieved and handed to the Apple backend for this intent.
    expect(captured?.result.retrievedMemory?.map((e) => e.id)).toContain('pref-fitness');

    // The on-device run executed and verified on the simulator.
    expect(outcome.success).toBe(true);

    // The successful execution was written back into memory (experience).
    const experiences = store.entries().filter((e) => e.kind === 'experience');
    expect(experiences.length).toBeGreaterThanOrEqual(1);
  });
});
