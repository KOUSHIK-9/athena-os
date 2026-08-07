import { createCapability } from './helpers.js';
import type { CapabilityRunContext } from './types.js';

async function execute(context: CapabilityRunContext) {
  if (context.action.type !== 'pressHome') return {};
  await context.driver.pressHome();
  return {};
}

export const homeCapability = createCapability({
  id: 'Home',
  kinds: ['pressHome'],
  validate: () => undefined,
  execute,
});
