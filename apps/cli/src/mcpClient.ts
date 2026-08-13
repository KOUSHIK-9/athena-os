import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface MCPToolResult {
  success?: boolean;
  error?: string;
  sessionId?: string;
  deviceUdid?: string;
  screenshot?: string;
  metadata?: Record<string, unknown>;
  timings?: Record<string, number>;
  [key: string]: unknown;
}

export class AthenaMCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(): Promise<void> {
    if (this.client) return;

    const serverBin = require.resolve('@athena-os/mcp-server/bin');

    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverBin],
      env: { ...process.env } as Record<string, string>,
      stderr: 'inherit',
    });

    this.client = new Client({ name: 'athena-cli', version: '0.0.1' });
    await this.client.connect(this.transport);
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<MCPToolResult> {
    if (!this.client) {
      throw new Error('Not connected to Athena MCP server. Call connect() first.');
    }

    const timeoutMs = Number(process.env.ATHENA_MCP_TIMEOUT ?? 300000);
    const result = (await this.client.callTool(
      { name, arguments: args },
      undefined,
      { timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300000 },
    )) as {
      content: Array<{ type: string; text?: string }>;
    };

    const text = result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('\n');

    try {
      return JSON.parse(text) as MCPToolResult;
    } catch {
      return { success: false, error: text };
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.transport = null;
  }
}

let instance: AthenaMCPClient | null = null;

export async function getMCPClient(): Promise<AthenaMCPClient> {
  if (!instance) {
    instance = new AthenaMCPClient();
    await instance.connect();
  }
  return instance;
}
