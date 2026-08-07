import type { Action } from '@athena-os/core';
import { ValidationError } from '@athena-os/shared';
import { createCapability } from './helpers.js';
import type { CapabilityRunContext } from './types.js';

function assertType(action: Action): asserts action is Extract<Action, { type: 'type' }> {
  if (action.type !== 'type') return;
  if (!action.text) {
    throw new ValidationError('type requires text', 'text', null);
  }
}

async function execute(context: CapabilityRunContext) {
  const action = context.action;
  if (action.type !== 'type') return {};
  await context.driver.type(action.text!, action.selector);
  return { metadata: { selector: action.selector, chars: action.text.length } };
}

export const typeCapability = createCapability({
  id: 'Type',
  kinds: ['type'],
  validate: assertType,
  execute,
});
