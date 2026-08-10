import type { Action, VerificationResult } from '@athena-os/core';
import { ValidationError } from '@athena-os/shared';
import { createVerificationResult } from '@athena-os/core';
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

async function verify(context: CapabilityRunContext): Promise<VerificationResult> {
  if (context.action.type !== 'type') {
    return createVerificationResult('session-healthy', Boolean(context.session), {});
  }
  const text = context.action.text ?? '';
  const visible = await context.driver.sourceContains(text);
  return createVerificationResult('text-visible', visible, { text });
}

export const typeCapability = createCapability({
  id: 'Type',
  kinds: ['type'],
  validate: assertType,
  execute,
  verify,
});
