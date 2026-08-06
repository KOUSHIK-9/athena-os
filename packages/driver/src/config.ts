import { z } from 'zod';

export const DriverConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().default(4723),
  timeout: z.number().default(30000),
  retries: z.number().default(3),
  wdaPath: z.string().optional(),
  wdaBundleId: z.string().default('com.apple.WebDriverAgentRunner'),
});

export type DriverConfig = z.infer<typeof DriverConfigSchema>;

let cachedConfig: DriverConfig | null = null;

export function loadDriverConfig(): DriverConfig {
  if (cachedConfig) return cachedConfig;

  const parsed = DriverConfigSchema.safeParse({
    host: process.env.ATHENA_APPIUM_HOST ?? '127.0.0.1',
    port: process.env.ATHENA_APPIUM_PORT ? parseInt(process.env.ATHENA_APPIUM_PORT, 10) : 4723,
    timeout: process.env.ATHENA_APPIUM_TIMEOUT
      ? parseInt(process.env.ATHENA_APPIUM_TIMEOUT, 10)
      : 30000,
    retries: process.env.ATHENA_APPIUM_RETRIES
      ? parseInt(process.env.ATHENA_APPIUM_RETRIES, 10)
      : 3,
    wdaPath: process.env.ATHENA_WDA_PATH,
    wdaBundleId: 'com.apple.WebDriverAgentRunner',
  });

  if (!parsed.success) {
    throw new Error(`Driver configuration validation failed: ${parsed.error.message}`);
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}
