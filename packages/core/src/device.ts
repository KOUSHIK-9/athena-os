import { z } from 'zod';

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
  screenshotDir: z.string().default('screenshots'),
  verifyAppState: z.boolean().default(false),
  verifyAppLaunch: z.boolean().default(false),
});

export type SessionConfig = z.infer<typeof SessionConfigSchema>;

export interface Session {
  id: string;
  deviceUdid: string;
  capabilities: Record<string, unknown>;
  createdAt: Date;
  lastActivity: Date;
}
