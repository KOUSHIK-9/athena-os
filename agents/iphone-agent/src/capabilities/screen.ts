import type { ActiveApp, UITree } from '@athena-os/core';
import { buildSemanticModel } from '@athena-os/understanding';
import type { CapabilityRunContext } from './types.js';

export const SPRINGBOARD_BUNDLE_ID = 'com.apple.springboard';

/** Read the current accessibility tree, returning undefined if it cannot be obtained. */
export async function observeTree(ctx: CapabilityRunContext): Promise<UITree | undefined> {
  try {
    return await ctx.driver.getUITree();
  } catch {
    return undefined;
  }
}

/** True when the screen rendered at least one element (i.e. the app did not crash to a blank UI). */
export async function screenIsHealthy(ctx: CapabilityRunContext): Promise<boolean> {
  const tree = await observeTree(ctx);
  if (!tree) return false;
  try {
    return buildSemanticModel(tree).summary.elementCount > 0;
  } catch {
    return Array.isArray(tree.children) && tree.children.length > 0;
  }
}

/** The application currently foreground on the device, if determinable. */
export async function activeApp(ctx: CapabilityRunContext): Promise<ActiveApp | undefined> {
  try {
    return await ctx.driver.getActiveApp();
  } catch {
    return undefined;
  }
}

export function isSpringBoard(app: ActiveApp | undefined): boolean {
  return app?.bundleId.toLowerCase() === SPRINGBOARD_BUNDLE_ID;
}

export function foregroundMatches(app: ActiveApp | undefined, bundleId: string): boolean {
  return app?.bundleId.toLowerCase() === bundleId.toLowerCase();
}
