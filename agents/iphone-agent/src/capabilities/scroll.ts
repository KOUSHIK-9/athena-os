import type { Action } from '@athena-os/core';
import { ValidationError } from '@athena-os/shared';
import { createCapability } from './helpers.js';
import type { CapabilityRunContext } from './types.js';

function assertScroll(action: Action): asserts action is Extract<Action, { type: 'swipe' }> {
  if (action.type !== 'swipe') return;
  if (!action.direction) {
    throw new ValidationError('swipe requires a direction', 'direction', null);
  }
}

async function execute(context: CapabilityRunContext) {
  const action = context.action;
  if (action.type !== 'swipe') return {};
  await context.driver.swipe(action.selector, action.direction, action.distance);
  return { metadata: { direction: action.direction, distance: action.distance } };
}

export const scrollCapability = createCapability({
  id: 'Scroll',
  kinds: ['swipe'],
  validate: assertScroll,
  execute,
});
