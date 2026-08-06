#!/usr/bin/env node
process.env.ATHENA_LOG_STREAM = 'stderr';

void (async () => {
  const { startMCPServer } = await import('./server.js');

  async function main(): Promise<void> {
    await startMCPServer();

    process.stdin.resume();
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
  }

  await main();
})().catch((error: unknown) => {
  console.error('[ATHENA_MCP] failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
