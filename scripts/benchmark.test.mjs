import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveMetrics } from './benchmark.mjs';

function mk(result, extra = {}) {
  return { json: result, latencyMs: result.latencyMs ?? 1, success: result.success ?? true, ...extra };
}

test('executionFailed counts as plan-valid but execution-unsuccessful', () => {
  const m = deriveMetrics(
    mk({
      success: false,
      kind: 'executionFailed',
      error: 'boom',
      plan: { steps: [{ capabilityId: 'launchApp' }] },
      executed: [{ success: false }],
    })
  );
  assert.equal(m.extractionSuccess, true);
  assert.equal(m.planValid, true);
  assert.equal(m.executionSuccess, false);
  assert.equal(m.executedSteps, 1);
});

test('clarificationRequired is not extraction or plan success', () => {
  const m = deriveMetrics(
    mk({ success: false, kind: 'clarificationRequired', reason: 'no capability' })
  );
  assert.equal(m.extractionSuccess, false);
  assert.equal(m.planValid, false);
  assert.equal(m.executionSuccess, false);
});

test('executed with all steps successful is execution success', () => {
  const m = deriveMetrics(
    mk({
      success: true,
      kind: 'executed',
      plan: { steps: [{ capabilityId: 'openApp' }] },
      executed: [{ success: true }],
    })
  );
  assert.equal(m.extractionSuccess, true);
  assert.equal(m.planValid, true);
  assert.equal(m.executionSuccess, true);
});

test('rejected goal is extracted but not plan-valid', () => {
  const m = deriveMetrics(mk({ success: false, kind: 'rejected', plan: { steps: [{ capabilityId: 'x' }] } }));
  assert.equal(m.extractionSuccess, true);
  assert.equal(m.planValid, false);
  assert.equal(m.executionSuccess, false);
});

test('error result (no json) is neither extraction nor plan success', () => {
  const m = deriveMetrics({ success: false, kind: 'error', parseError: 'x', latencyMs: 5 });
  assert.equal(m.extractionSuccess, false);
  assert.equal(m.planValid, false);
  assert.equal(m.executionSuccess, false);
});

test('result with missing/unknown kind is treated as error, not extraction success', () => {
  const m = deriveMetrics(mk({ success: false, error: 'model returned invalid JSON' }));
  assert.equal(m.kind, 'error');
  assert.equal(m.extractionSuccess, false);
  assert.equal(m.planValid, false);
  assert.equal(m.executionSuccess, false);
  assert.equal(m.clarification, 'model returned invalid JSON');
});
