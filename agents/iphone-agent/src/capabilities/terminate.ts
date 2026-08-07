import type { Action } from '@athena-os/core';
import { ValidationError } from '@athena-os/shared';
import { createCapability } from './helpers.js';
import type { CapabilityRunContext } from './types.js';

function assertTerminate(
  action: Action
): asserts action is Extract<Action, { type: 'terminateApp' }> {
  if (action.type !== 'terminateApp') return;
  if (!action.bundleId) {
    throw new ValidationError(
      'terminateApp requires a bundleId',
      'bundleId',
      action.bundleId ?? null
    );
  }
}

async function execute(context: CapabilityRunContext) {
  const action = context.action;
  if (action.type !== 'terminateApp') return {};
  await context.driver.terminateApp(action.bundleId);
  return {};
}

export const terminateCapability = createCapability({
  id: 'Terminate',
  kinds: ['terminateApp'],
  validate: assertTerminate,
  execute,
});
