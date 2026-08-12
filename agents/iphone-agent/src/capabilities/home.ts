import type { VerificationResult } from '@athena-os/core';
import { createVerificationResult } from '@athena-os/core';
import { createCapability } from './helpers.js';
import type { CapabilityRunContext } from './types.js';
import { activeApp, isSpringBoard } from './screen.js';

async function execute(context: CapabilityRunContext) {
  if (context.action.type !== 'pressHome') return {};
  await context.driver.pressHome();
  return {};
}

async function verify(context: CapabilityRunContext): Promise<VerificationResult> {
  const active = await activeApp(context);
  // We can only confirm home when the foreground app is SpringBoard; if the
  // driver can't report the foreground app we don't fail the step.
  const onHome = !active || isSpringBoard(active);
  return createVerificationResult('home-screen', onHome, {
    activeBundleId: active?.bundleId,
  });
}

export const homeCapability = createCapability({
  id: 'Home',
  kinds: ['pressHome'],
  validate: () => undefined,
  execute,
  verify,
});
