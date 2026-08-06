import { z } from 'zod';
import { SelectorSchema } from '@athena-os/core';

export const ConnectParamsSchema = z.object({
  udid: z.string().optional(),
  bundleId: z.string().optional(),
});

export const LaunchAppParamsSchema = z.object({
  app: z.string().optional(),
  bundleId: z.string().optional(),
});

export const TapParamsSchema = z.object({
  selector: SelectorSchema.optional(),
});

export const TypeParamsSchema = z.object({
  text: z.string(),
  selector: SelectorSchema.optional(),
});

export const SwipeParamsSchema = z.object({
  selector: SelectorSchema.optional(),
  direction: z.enum(['up', 'down', 'left', 'right']),
  distance: z.number().optional(),
});

export const ScreenshotParamsSchema = z.object({});

export const GetTreeParamsSchema = z.object({});

export const PressHomeParamsSchema = z.object({});

export const TerminateAppParamsSchema = z.object({
  bundleId: z.string(),
});

export const WaitParamsSchema = z.object({
  duration: z.number(),
});

export const BackParamsSchema = z.object({});

export const DisconnectParamsSchema = z.object({});
