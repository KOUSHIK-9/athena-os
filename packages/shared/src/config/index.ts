import { z } from 'zod';

export const DeviceConfigSchema = z.object({
  udid: z.string().optional(),
  name: z.string().optional(),
  autoDetect: z.boolean().default(true),
  developerModeCheck: z.boolean().default(true),
});

export type DeviceConfig = z.infer<typeof DeviceConfigSchema>;

export const AppiumConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().default(4723),
  timeout: z.number().default(30000),
  retries: z.number().default(3),
  wdaPath: z.string().optional(),
  wdaBundleId: z.string().default('com.apple.WebDriverAgentRunner'),
});

export type AppiumConfig = z.infer<typeof AppiumConfigSchema>;

export const ServerConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().default(3000),
  cors: z.boolean().default(true),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export const MCPConfigSchema = z.object({
  transport: z.enum(['stdio', 'http', 'websocket']).default('stdio'),
  httpPort: z.number().default(3001),
  websocketPort: z.number().default(3002),
});

export type MCPConfig = z.infer<typeof MCPConfigSchema>;

export const ConfigSchema = z.object({
  device: DeviceConfigSchema,
  appium: AppiumConfigSchema,
  server: ServerConfigSchema,
  mcp: MCPConfigSchema,
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

function getEnvConfig(): Partial<Config> {
  return {
    device: {
      udid: process.env.ATHENA_DEVICE_UDID,
      autoDetect: process.env.ATHENA_AUTO_DETECT !== 'false',
      developerModeCheck: process.env.ATHENA_DEVELOPER_MODE_CHECK !== 'false',
    },
    appium: {
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
    },
    server: {
      host: process.env.ATHENA_SERVER_HOST ?? '127.0.0.1',
      port: process.env.ATHENA_SERVER_PORT ? parseInt(process.env.ATHENA_SERVER_PORT, 10) : 3000,
      cors: true,
    },
    mcp: {
      transport: (process.env.ATHENA_MCP_TRANSPORT as 'stdio' | 'http' | 'websocket') ?? 'stdio',
      httpPort: process.env.ATHENA_MCP_HTTP_PORT
        ? parseInt(process.env.ATHENA_MCP_HTTP_PORT, 10)
        : 3001,
      websocketPort: process.env.ATHENA_MCP_WS_PORT
        ? parseInt(process.env.ATHENA_MCP_WS_PORT, 10)
        : 3002,
    },
    logLevel: (process.env.LOG_LEVEL as Config['logLevel']) ?? 'info',
  };
}

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const envConfig = getEnvConfig();
  const parsed = ConfigSchema.safeParse(envConfig);

  if (!parsed.success) {
    throw new Error(`Configuration validation failed: ${parsed.error.message}`);
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}

export function getConfig(): Config {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}
