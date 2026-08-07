import { describe, expect, it } from 'vitest';
import { DeterministicReasoningBackend } from '@athena-os/reasoning';
import { runConformance } from './conformance/harness.js';
import { parityScenarios } from './conformance/fixtures/parity.js';

/**
 * RFC-0012 §Reference Implementation: the deterministic backend is the
 * reference backend. These tests certify it against the canonical parity
 * fixtures — a conforming backend (including a future LLM) must reproduce
 * these results exactly (deep equality).
 */
describe('DeterministicReasoningBackend conformance (RFC-0012)', () => {
  const backend = new DeterministicReasoningBackend();

  it('reproduces every parity fixture exactly', () => {
    const report = runConformance(backend, parityScenarios);

    expect(report.backendId).toBe('deterministic');
    expect(report.total).toBe(parityScenarios.length);
    expect(report.passed).toBe(parityScenarios.length);
    expect(report.failed).toBe(0);
  });

  it('produces full candidate plans, not just goal containment', () => {
    const report = runConformance(backend, parityScenarios);

    for (const result of report.results) {
      expect(result.actual).toEqual(result.expected);
    }
  });

  it('declares its identity as a ReasoningBackend', () => {
    expect(backend.id).toBe('deterministic');
  });
});
