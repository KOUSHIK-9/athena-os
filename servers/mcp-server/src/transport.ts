export type TransportType = 'stdio' | 'http' | 'websocket';

export interface Transport {
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (message: unknown) => Promise<void>): void;
  send(message: unknown): Promise<void>;
}

export class StdioTransport implements Transport {
  private handler?: (message: unknown) => Promise<void>;

  async start(): Promise<void> {
    process.stdin.on('data', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (this.handler) {
          await this.handler(message);
        }
      } catch (error) {
        console.error('Failed to parse stdin message:', error);
      }
    });
  }

  async stop(): Promise<void> {
    // No-op for stdio
  }

  onMessage(handler: (message: unknown) => Promise<void>): void {
    this.handler = handler;
  }

  async send(message: unknown): Promise<void> {
    process.stdout.write(JSON.stringify(message) + '\n');
  }
}

export function createTransport(type: TransportType): Transport {
  switch (type) {
    case 'stdio':
      return new StdioTransport();
    case 'http':
      throw new Error('HTTP transport not yet implemented');
    case 'websocket':
      throw new Error('WebSocket transport not yet implemented');
    default:
      throw new Error(`Unknown transport type: ${type}`);
  }
}
