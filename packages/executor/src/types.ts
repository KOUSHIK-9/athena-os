import { z } from 'zod';

export const SelectorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('accessibilityId'), value: z.string() }),
  z.object({ type: z.literal('label'), value: z.string() }),
  z.object({ type: z.literal('predicate'), value: z.string() }),
  z.object({ type: z.literal('xpath'), value: z.string() }),
  z.object({ type: z.literal('coordinates'), x: z.number(), y: z.number() }),
]);

export type Selector =
  | { type: 'accessibilityId'; value: string }
  | { type: 'label'; value: string }
  | { type: 'predicate'; value: string }
  | { type: 'xpath'; value: string }
  | { type: 'coordinates'; x: number; y: number };

export function isAccessibilityIdSelector(
  selector: Selector
): selector is { type: 'accessibilityId'; value: string } {
  return selector.type === 'accessibilityId';
}

export function isLabelSelector(selector: Selector): selector is { type: 'label'; value: string } {
  return selector.type === 'label';
}

export function isPredicateSelector(
  selector: Selector
): selector is { type: 'predicate'; value: string } {
  return selector.type === 'predicate';
}

export function isXPathSelector(selector: Selector): selector is { type: 'xpath'; value: string } {
  return selector.type === 'xpath';
}

export function isCoordinatesSelector(
  selector: Selector
): selector is { type: 'coordinates'; x: number; y: number } {
  return selector.type === 'coordinates';
}

export const DeviceInfoSchema = z.object({
  udid: z.string(),
  name: z.string(),
  model: z.string(),
  osVersion: z.string(),
  isSimulator: z.boolean(),
  developerMode: z.boolean(),
});

export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

export const SessionConfigSchema = z.object({
  deviceUdid: z.string(),
  bundleId: z.string().optional(),
  timeout: z.number().default(30000),
  retries: z.number().default(3),
  screenshotOnFailure: z.boolean().default(true),
});

export type SessionConfig = z.infer<typeof SessionConfigSchema>;

export interface Session {
  id: string;
  deviceUdid: string;
  capabilities: Record<string, unknown>;
  createdAt: Date;
  lastActivity: Date;
}
