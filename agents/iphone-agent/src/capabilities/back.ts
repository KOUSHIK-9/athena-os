import { createCapability } from './helpers.js';
import type { CapabilityRunContext } from './types.js';

async function execute(context: CapabilityRunContext) {
  if (context.action.type !== 'back') return {};
  await context.driver.back();
  return {};
}

export const backCapability = createCapability({
  id: 'Back',
  kinds: ['back'],
  validate: () => undefined,
  execute,
});
