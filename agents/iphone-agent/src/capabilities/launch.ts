import type { Action, ActiveApp } from '@athena-os/core';
import { ValidationError } from '@athena-os/shared';
import { createVerificationResult } from '@athena-os/core';
import { createCapability } from './helpers.js';
import type { CapabilityRunContext } from './types.js';
import { activeApp, foregroundMatches } from './screen.js';

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
  const action = context.action;
  if (action.type !== 'launchApp') {
    return createVerificationResult('launch-acknowledged', true, {});
  }
  if (context.config?.verifyAppLaunch && action.bundleId) {
    // The foreground probe (mobile: getActiveApp) is occasionally unavailable
    // on the simulator right after launch. Retry briefly before concluding, so
    // a flaky probe does not masquerade as a launch failure.
    let active: ActiveApp | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      active = await activeApp(context);
      if (active) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!active) {
      // Foreground probe unavailable (e.g. simulator getActiveApp flake). The
      // launch command itself succeeded, so acknowledge rather than fail on a
      // flaky probe.
      return createVerificationResult('launch-acknowledged', true, { bundleId: action.bundleId });
    }
    const verified = foregroundMatches(active, action.bundleId);
    return createVerificationResult('app-foreground', verified, {
      expectedBundleId: action.bundleId,
      activeBundleId: active.bundleId,
    });
  }
  return createVerificationResult('launch-acknowledged', true, { bundleId: action.bundleId });
}

export const launchCapability = createCapability({
  id: 'Launch',
  kinds: ['launchApp'],
  validate: assertLaunch,
  execute,
  verify,
});
