import { createVerificationResult, type SemanticModel } from '@athena-os/core';
import { buildSemanticModel } from '@athena-os/understanding';
import { createCapability } from './helpers.js';
import type { CapabilityResultPayload, CapabilityRunContext } from './types.js';

async function execute(context: CapabilityRunContext) {
  if (context.action.type !== 'getTree') return {};

  const tree = await context.driver.getUITree();
  const model = buildSemanticModel(tree);
  return { metadata: { model, tree } as unknown as Record<string, unknown> };
}

async function verify(context: CapabilityRunContext, result: CapabilityResultPayload) {
  const model = (result.metadata?.model ?? null) as Partial<SemanticModel> | null | undefined;
  const verified = Boolean(
    model?.root && typeof model.summary?.elementCount === 'number' && model.summary.elementCount > 1
  );
  return createVerificationResult('tree-has-nodes', verified, {
    elementCount: model?.summary?.elementCount,
    score: model?.score,
    interactiveCount: model?.summary?.interactiveCount,
  });
}

export const treeCapability = createCapability({
  id: 'Tree',
  kinds: ['getTree'],
  validate: () => undefined,
  execute,
  verify,
});
