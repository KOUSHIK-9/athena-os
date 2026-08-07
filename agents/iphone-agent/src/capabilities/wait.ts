import type { Action } from '@athena-os/core';
import { ValidationError } from '@athena-os/shared';
import { createCapability } from './helpers.js';
import type { CapabilityRunContext } from './types.js';

function assertWait(action: Action): asserts action is Extract<Action, { type: 'wait' }> {
  if (action.type !== 'wait') return;
  if (typeof action.duration !== 'number' || action.duration < 0) {
    throw new ValidationError(
      'wait requires a non-negative duration',
      'duration',
      action.duration ?? null
    );
  }
}

async function execute(context: CapabilityRunContext) {
  const action = context.action;
  if (action.type !== 'wait') return {};
  await context.driver.wait(action.duration);
  return { metadata: { durationMs: action.duration } };
}

export const waitCapability = createCapability({
  id: 'Wait',
  kinds: ['wait'],
  validate: assertWait,
  execute,
});
