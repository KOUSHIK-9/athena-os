import type { Action } from '@athena-os/core';
import { ValidationError } from '@athena-os/shared';
import { createCapability } from './helpers.js';
import type { CapabilityRunContext } from './types.js';

function assertTap(action: Action): asserts action is Extract<Action, { type: 'tap' }> {
  if (action.type !== 'tap') return;
  if (!action.selector) {
    throw new ValidationError('tap requires a selector', 'selector', null);
  }
}

async function execute(context: CapabilityRunContext) {
  const action = context.action;
  if (action.type !== 'tap') return {};
  await context.driver.tap(action.selector!);
  return { metadata: { selector: action.selector } };
}

export const tapCapability = createCapability({
  id: 'Tap',
  kinds: ['tap'],
  validate: assertTap,
  execute,
});
