import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MemoryEntry } from '@athena-os/core';
import { FileMemoryStore, InMemoryStore } from '@athena-os/memory';
import { reasonForRun } from './reason.js';

describe('Memory → run-layer reasoning (RFC-0013/0014)', () => {
  it('threads a recorded preference through reasonForRun to the backend result', () => {
    const store = new InMemoryStore();
    const pref: MemoryEntry = {
      id: 'pref-seat',
      kind: 'preference',
      subject: 'user.seat',
      recordedAt: '2026-01-01T00:00:00.000Z',
      payload: { value: 'window' },
    };
    store.record(pref);

    const run = reasonForRun('Open Settings', { backend: 'deterministic', memory: store });

    expect(run.result.kind).toBe('executionPlan');
    if (run.result.kind === 'executionPlan') {
      expect(run.result.retrievedMemory?.map((e) => e.id)).toContain('pref-seat');
    }
  });

  it('produces no retrievedMemory without a memory store', () => {
    const run = reasonForRun('Open Settings', { backend: 'deterministic' });
    if (run.result.kind === 'executionPlan') {
      expect(run.result.retrievedMemory).toBeUndefined();
    }
  });

  it('retrieves from a FileMemoryStore across instances (the run-tool wiring)', () => {
    const tmp = join(tmpdir(), `athena-run-mem-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
    try {
      const writer = new FileMemoryStore(tmp);
      const pref: MemoryEntry = {
        id: 'pref-app',
        kind: 'preference',
        subject: 'user.preferredApp',
        recordedAt: '2026-01-01T00:00:00.000Z',
        payload: { value: 'Messages' },
      };
      writer.record(pref);

      // A fresh process-equivalent store (what the `run` tool constructs each invocation).
      const reader = new FileMemoryStore(tmp);
      const run = reasonForRun('Open Settings', { backend: 'deterministic', memory: reader });

      expect(run.result.kind).toBe('executionPlan');
      if (run.result.kind === 'executionPlan') {
        expect(run.result.retrievedMemory?.map((e) => e.id)).toContain('pref-app');
      }
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  });
});
