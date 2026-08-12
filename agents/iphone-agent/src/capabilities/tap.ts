import type { Action, VerificationResult } from '@athena-os/core';
import { createVerificationResult } from '@athena-os/core';
import { ValidationError } from '@athena-os/shared';
import { createCapability } from './helpers.js';
import type { CapabilityRunContext } from './types.js';
import { screenIsHealthy } from './screen.js';

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

async function verify(context: CapabilityRunContext): Promise<VerificationResult> {
  if (context.config?.verifyAppState) {
    const healthy = await screenIsHealthy(context);
    return createVerificationResult('app-screen-observed', healthy, {});
  }
  return createVerificationResult('screen-observed', true, {});
}

export const tapCapability = createCapability({
  id: 'Tap',
  kinds: ['tap'],
  validate: assertTap,
  execute,
  verify,
});
