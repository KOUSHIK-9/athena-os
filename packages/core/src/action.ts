import { z } from 'zod';
import type { Selector } from './selector.js';
import { SelectorSchema } from './selector.js';

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('launchApp'),
    bundleId: z.string(),
    description: z.string(),
  }),
  z.object({
    type: z.literal('tap'),
    selector: SelectorSchema.optional(),
    description: z.string(),
  }),
  z.object({
    type: z.literal('type'),
    text: z.string(),
    selector: SelectorSchema.optional(),
    description: z.string(),
  }),
  z.object({
    type: z.literal('screenshot'),
    description: z.string(),
  }),
  z.object({
    type: z.literal('getTree'),
    description: z.string(),
  }),
  z.object({
    type: z.literal('pressHome'),
    description: z.string(),
  }),
  z.object({
    type: z.literal('terminateApp'),
    bundleId: z.string(),
    description: z.string(),
  }),
  z.object({
    type: z.literal('swipe'),
    selector: SelectorSchema.optional(),
    direction: z.enum(['up', 'down', 'left', 'right']),
    distance: z.number().optional(),
    description: z.string(),
  }),
  z.object({
    type: z.literal('wait'),
    duration: z.number(),
    description: z.string(),
  }),
  z.object({
    type: z.literal('back'),
    description: z.string(),
  }),
]);

export type Action =
  | { type: 'launchApp'; bundleId: string; description: string }
  | { type: 'tap'; selector?: Selector; description: string }
  | { type: 'type'; text: string; selector?: Selector; description: string }
  | { type: 'screenshot'; description: string }
  | { type: 'getTree'; description: string }
  | { type: 'pressHome'; description: string }
  | { type: 'terminateApp'; bundleId: string; description: string }
  | {
      type: 'swipe';
      selector?: Selector;
      direction: 'up' | 'down' | 'left' | 'right';
      distance?: number;
      description: string;
    }
  | { type: 'wait'; duration: number; description: string }
  | { type: 'back'; description: string };

export function createLaunchAppAction(bundleId: string, description?: string): Action {
  return { type: 'launchApp', bundleId, description: description ?? `Launch app ${bundleId}` };
}

export function createTapAction(selector?: Selector, description?: string): Action {
  return { type: 'tap', selector, description: description ?? 'Tap element' };
}

export function createTypeAction(text: string, selector?: Selector, description?: string): Action {
  return { type: 'type', text, selector, description: description ?? `Type text: ${text}` };
}

export function createScreenshotAction(description?: string): Action {
  return { type: 'screenshot', description: description ?? 'Take screenshot' };
}

export function createGetTreeAction(description?: string): Action {
  return { type: 'getTree', description: description ?? 'Get accessibility tree' };
}

export function createPressHomeAction(description?: string): Action {
  return { type: 'pressHome', description: description ?? 'Press home button' };
}

export function createTerminateAppAction(bundleId: string, description?: string): Action {
  return {
    type: 'terminateApp',
    bundleId,
    description: description ?? `Terminate app ${bundleId}`,
  };
}

export function createSwipeAction(
  direction: 'up' | 'down' | 'left' | 'right',
  selector?: Selector,
  distance?: number,
  description?: string
): Action {
  return {
    type: 'swipe',
    selector,
    direction,
    distance,
    description: description ?? `Swipe ${direction}`,
  };
}

export function createWaitAction(duration: number, description?: string): Action {
  return { type: 'wait', duration, description: description ?? `Wait ${duration}ms` };
}

export function createBackAction(description?: string): Action {
  return { type: 'back', description: description ?? 'Go back' };
}
