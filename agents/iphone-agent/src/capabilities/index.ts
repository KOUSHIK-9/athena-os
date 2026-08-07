import type { Action } from '@athena-os/core';
import type { Capability, ActionKind } from './types.js';
import { launchCapability } from './launch.js';
import { terminateCapability } from './terminate.js';
import { tapCapability } from './tap.js';
import { typeCapability } from './type.js';
import { scrollCapability } from './scroll.js';
import { homeCapability } from './home.js';
import { backCapability } from './back.js';
import { waitCapability } from './wait.js';
import { screenshotCapability } from './screenshot.js';
import { treeCapability } from './tree.js';

export type {
  Capability,
  CapabilityRunContext,
  CapabilityResultPayload,
  ActionKind,
} from './types.js';

const CAPABILITIES: Capability[] = [
  launchCapability,
  terminateCapability,
  tapCapability,
  typeCapability,
  scrollCapability,
  homeCapability,
  backCapability,
  waitCapability,
  screenshotCapability,
  treeCapability,
];

const BY_KIND = new Map<ActionKind, Capability>();
for (const capability of CAPABILITIES) {
  for (const kind of capability.kinds) {
    BY_KIND.set(kind, capability);
  }
}

export function capabilityFor(actionType: Action['type']): Capability {
  const capability = BY_KIND.get(actionType);
  if (!capability) {
    throw new Error(`No capability registered for action type: ${actionType}`);
  }
  return capability;
}

export const allCapabilities: Capability[] = CAPABILITIES;
