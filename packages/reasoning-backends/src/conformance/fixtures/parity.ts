import type { CapabilityDescriptor, CapabilityRegistry } from '@athena-os/core';
import type { ReasoningBackendResult } from '@athena-os/reasoning';
import type { ConformanceScenario } from '../scenario.js';

/**
 * Canonical parity fixtures — frozen from the RFC-0011 deterministic
 * reference backend (captured 2026-08-07). A conforming backend must
 * reproduce these results exactly (RFC-0012 §Parity Conformance).
 */

function capability(id: string, description: string, goalKinds: string[]): CapabilityDescriptor {
  return { id, description, goalKinds, availability: 'available', requiresResources: [] };
}

const openSettingsRegistry: CapabilityRegistry = {
  capabilities: () => [capability('app-launch', 'Launch an application', ['openApp'])],
};

const replyMessageRegistry: CapabilityRegistry = {
  capabilities: () => [capability('messages-send', 'Send a message', ['sendMessage'])],
};

const photoCleanupRegistry: CapabilityRegistry = {
  capabilities: () => [
    capability('photos-manage', 'Manage photo library', ['cleanPhotos', 'connectService']),
  ],
};

const launchCameraRegistry: CapabilityRegistry = {
  capabilities: () => [capability('camera-launch', 'Launch the camera', ['openApp'])],
};

const toggleDarkModeRegistry: CapabilityRegistry = {
  capabilities: () => [capability('settings-toggle', 'Toggle a setting', ['toggleSetting'])],
};

export const openSettingsScenario: ConformanceScenario = {
  id: 'open-settings',
  layer: 'parity',
  intent: { id: 'intent-open-settings', text: 'Open Settings', goals: [], constraints: [] },
  registry: openSettingsRegistry,
  expected: {
    kind: 'executionPlan',
    plan: {
      id: 'plan-intent-open-settings',
      intentId: 'intent-open-settings',
      steps: [
        {
          id: 'step-1',
          goalId: 'goal-1',
          capabilityId: 'app-launch',
          action: 'execute',
          description: "Satisfy 'openApp' with 'app-launch'",
          dependsOn: [],
        },
      ],
    },
  } satisfies ReasoningBackendResult,
};

export const replyMessageScenario: ConformanceScenario = {
  id: 'reply-message',
  layer: 'parity',
  intent: { id: 'intent-reply-message', text: 'reply to Alice', goals: [], constraints: [] },
  registry: replyMessageRegistry,
  expected: {
    kind: 'executionPlan',
    plan: {
      id: 'plan-intent-reply-message',
      intentId: 'intent-reply-message',
      steps: [
        {
          id: 'step-1',
          goalId: 'goal-1',
          capabilityId: 'messages-send',
          action: 'execute',
          description: "Satisfy 'sendMessage' with 'messages-send'",
          dependsOn: [],
        },
      ],
    },
  } satisfies ReasoningBackendResult,
};

export const photoCleanupScenario: ConformanceScenario = {
  id: 'photo-cleanup',
  layer: 'parity',
  intent: {
    id: 'intent-photo-cleanup',
    goals: [
      { id: 'g1', kind: 'connectService', description: 'Disconnect the photo service' },
      { id: 'g2', kind: 'cleanPhotos', description: 'Delete screenshots older than 30 days' },
    ],
    constraints: [],
  },
  registry: photoCleanupRegistry,
  expected: {
    kind: 'executionPlan',
    plan: {
      id: 'plan-intent-photo-cleanup',
      intentId: 'intent-photo-cleanup',
      steps: [
        {
          id: 'step-1',
          goalId: 'g1',
          capabilityId: 'photos-manage',
          action: 'execute',
          description: "Satisfy 'connectService' with 'photos-manage'",
          dependsOn: [],
        },
        {
          id: 'step-2',
          goalId: 'g2',
          capabilityId: 'photos-manage',
          action: 'execute',
          description: "Satisfy 'cleanPhotos' with 'photos-manage'",
          dependsOn: ['step-1'],
        },
      ],
    },
  } satisfies ReasoningBackendResult,
};

export const launchCameraScenario: ConformanceScenario = {
  id: 'launch-camera',
  layer: 'parity',
  intent: { id: 'intent-launch-camera', text: 'open camera', goals: [], constraints: [] },
  registry: launchCameraRegistry,
  expected: {
    kind: 'executionPlan',
    plan: {
      id: 'plan-intent-launch-camera',
      intentId: 'intent-launch-camera',
      steps: [
        {
          id: 'step-1',
          goalId: 'goal-1',
          capabilityId: 'camera-launch',
          action: 'execute',
          description: "Satisfy 'openApp' with 'camera-launch'",
          dependsOn: [],
        },
      ],
    },
  } satisfies ReasoningBackendResult,
};

export const toggleDarkModeScenario: ConformanceScenario = {
  id: 'toggle-dark-mode',
  layer: 'parity',
  intent: { id: 'intent-toggle-dark-mode', text: 'toggle dark mode', goals: [], constraints: [] },
  registry: toggleDarkModeRegistry,
  expected: {
    kind: 'executionPlan',
    plan: {
      id: 'plan-intent-toggle-dark-mode',
      intentId: 'intent-toggle-dark-mode',
      steps: [
        {
          id: 'step-1',
          goalId: 'goal-1',
          capabilityId: 'settings-toggle',
          action: 'execute',
          description: "Satisfy 'toggleSetting' with 'settings-toggle'",
          dependsOn: [],
        },
      ],
    },
  } satisfies ReasoningBackendResult,
};

export const parityScenarios: readonly ConformanceScenario[] = [
  openSettingsScenario,
  replyMessageScenario,
  photoCleanupScenario,
  launchCameraScenario,
  toggleDarkModeScenario,
];
