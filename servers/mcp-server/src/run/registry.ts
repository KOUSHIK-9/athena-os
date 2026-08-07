import type { CapabilityDescriptor, CapabilityRegistry } from '@athena-os/core';

/**
 * Capability registry for the on-device run bridge (RFC-0011: registry
 * vocabulary is the contract between reasoning and execution).
 *
 * Capability ids mirror the executor's `ActionKind` (`launchApp`, `tap`,
 * ...) so a plan step maps 1:1 onto the device actions it can produce.
 * `goalKinds` are permissive aliases because the deterministic extractor
 * emits canonical kinds (`openApp`) while the LLM backend invents its own
 * (`tap`, `navigateBack`, ...) — both must resolve here for a plan to form.
 */
const RUN_CAPABILITIES: readonly CapabilityDescriptor[] = [
  {
    id: 'launchApp',
    description: 'Launch a device app by name or bundle identifier',
    goalKinds: [
      'openApp',
      'open',
      'launch',
      'launchApp',
      'start',
      'startApp',
      'foreground',
      'openApplication',
      'goToApp',
    ],
    availability: 'available',
    requiresResources: [],
  },
  {
    id: 'tap',
    description: 'Tap a visible UI element, resolved by its human-readable label',
    goalKinds: [
      'tap',
      'tapElement',
      'tapOn',
      'click',
      'clickOn',
      'press',
      'select',
      'toggle',
      'toggleSetting',
      'advance',
    ],
    availability: 'available',
    requiresResources: [],
  },
  {
    id: 'type',
    description: 'Type text into the focused input field',
    goalKinds: [
      'type',
      'typeText',
      'typeIn',
      'enter',
      'enterText',
      'input',
      'setText',
      'fill',
      'search',
    ],
    availability: 'available',
    requiresResources: [],
  },
  {
    id: 'pressHome',
    description: 'Press the device Home button',
    goalKinds: ['pressHome', 'home', 'goHome', 'homeButton'],
    availability: 'available',
    requiresResources: [],
  },
  {
    id: 'back',
    description: 'Navigate back to the previous screen',
    goalKinds: ['navigateBack', 'goBack', 'back', 'previous'],
    availability: 'available',
    requiresResources: [],
  },
  {
    id: 'wait',
    description: 'Wait a fixed duration for the screen to settle',
    goalKinds: ['wait', 'pause', 'sleep', 'delay'],
    availability: 'available',
    requiresResources: [],
  },
  {
    id: 'screenshot',
    description: 'Capture the current screen',
    goalKinds: ['screenshot', 'captureScreen', 'capture', 'takeScreenshot'],
    availability: 'available',
    requiresResources: [],
  },
];

export const iphoneRunRegistry: CapabilityRegistry = {
  capabilities: () => RUN_CAPABILITIES,
};
