#!/usr/bin/env node
process.env.ATHENA_LOG_STREAM = 'stderr';

const { startMCPServer } = await import('./server.js');
const { createLogger } = await import('@athena-os/shared');

const logger = createLogger('ATHENA_MCP');

async function main(): Promise<void> {
  await startMCPServer();

  process.stdin.resume();
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

main().catch((error) => {
  logger.error({ error }, 'MCP server failed to start');
  process.exit(1);
});