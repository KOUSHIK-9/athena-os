import type { Action } from '@athena-os/core';
import { ValidationError } from '@athena-os/shared';
import { createVerificationResult } from '@athena-os/core';
import { createCapability } from './helpers.js';
import type { CapabilityRunContext } from './types.js';

function assertLaunch(action: Action): asserts action is Extract<Action, { type: 'launchApp' }> {
  if (action.type !== 'launchApp') return;
  if (!action.bundleId) {
    throw new ValidationError('launchApp requires a bundleId', 'bundleId', action.bundleId ?? null);
  }
}

async function execute(context: CapabilityRunContext) {
  const action = context.action;
  if (action.type !== 'launchApp') return {};
  await context.driver.launchApp(action.bundleId);
  return {};
}

async function verify(context: CapabilityRunContext) {
  if (!context.config?.verifyAppLaunch) {
    return createVerificationResult('launch-acknowledged', true, {});
  }
  const healthy = context.driver.isSessionActive();
  return createVerificationResult('session-active', healthy, {
    sessionId: context.session?.id,
  });
}

export const launchCapability = createCapability({
  id: 'Launch',
  kinds: ['launchApp'],
  validate: assertLaunch,
  execute,
  verify,
});
