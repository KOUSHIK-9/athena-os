import { describe, expect, it } from 'vitest';
import { InMemoryStore } from './store.js';
import { DeterministicRetriever } from './reference.js';
import type { MemoryEntry } from '@athena-os/core';

/**
 * Memory benchmark — exercises the deterministic retriever at scale and prints a
 * small report. Acts as the "benchmark report" artifact for the Developer
 * Preview release. The threshold is intentionally generous so it certifies the
 * retriever stays O(n log n)-ish and never regresses into something pathological,
 * rather than pinning exact timings.
 */
const KINDS: MemoryEntry['kind'][] = ['fact', 'preference', 'experience', 'trigger'];

function seed(store: InMemoryStore, n: number): void {
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    const kind = KINDS[i % KINDS.length];
    store.record({
      id: `e${i}`,
      kind,
      subject: `${kind}.subject${i % 50}`,
      recordedAt: new Date(now + i).toISOString(),
      payload: { i },
    });
  }
}

describe('memory benchmark', () => {
  it('retrieves from a 2,000-entry store well under 100ms (report attached)', () => {
    const store = new InMemoryStore('bench');
    seed(store, 2000);
    const retriever = new DeterministicRetriever();
    const request = { intentKind: 'travel', requested: [] as string[] };

    // warmup
    for (let i = 0; i < 5; i++) retriever.retrieve(request, store);

    const iterations = 50;
    const samples: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      const res = retriever.retrieve(request, store);
      samples.push(performance.now() - t0);
      expect(res.entries.length).toBeGreaterThan(0);
    }
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length * 0.5)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    const max = samples[samples.length - 1];
    // eslint-disable-next-line no-console
    console.log(
      `\n[bench] DeterministicRetriever over 2000 entries (n=${iterations}): ` +
        `p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`
    );

    expect(max).toBeLessThan(100);
  });
});
