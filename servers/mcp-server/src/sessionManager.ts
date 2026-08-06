import { iPhoneExecutor } from '@athena-os/iphone-agent';
import type { SessionConfig } from '@athena-os/executor';
import { createLogger } from '@athena-os/shared';

const logger = createLogger('MCPSessionManager');

interface MCPManagedSession {
  executor: iPhoneExecutor;
  deviceUdid: string;
  createdAt: Date;
  lastActivity: Date;
}

export class MCPSessionManager {
  private sessions = new Map<string, MCPManagedSession>();
  private currentSessionId: string | null = null;

  async connect(config: SessionConfig): Promise<{ sessionId: string; deviceUdid: string }> {
    const udid = config.deviceUdid;

    if (this.sessions.has(udid)) {
      const existing = this.sessions.get(udid)!;
      logger.info({ udid }, 'Reusing existing MCP session');
      existing.lastActivity = new Date();
      this.currentSessionId = udid;
      return { sessionId: udid, deviceUdid: udid };
    }

    logger.info({ udid }, 'Creating new MCP session');

    const executor = new iPhoneExecutor();
    await executor.initialize(config);

    const managed: MCPManagedSession = {
      executor,
      deviceUdid: udid,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(udid, managed);
    this.currentSessionId = udid;

    return { sessionId: udid, deviceUdid: udid };
  }

  getExecutor(udid?: string): iPhoneExecutor {
    const targetUdid = udid ?? this.currentSessionId;
    if (!targetUdid) {
      throw new Error('No active session. Call connect() first.');
    }

    const managed = this.sessions.get(targetUdid);
    if (!managed) {
      throw new Error(`No session found for device: ${targetUdid}`);
    }

    managed.lastActivity = new Date();
    return managed.executor;
  }

  async disconnect(udid?: string): Promise<void> {
    const targetUdid = udid ?? this.currentSessionId;
    if (!targetUdid) return;

    const managed = this.sessions.get(targetUdid);
    if (managed) {
      await managed.executor.close();
      this.sessions.delete(targetUdid);
      logger.info({ udid: targetUdid }, 'MCP session disconnected');
    }

    if (this.currentSessionId === targetUdid) {
      this.currentSessionId = null;
    }
  }

  async disconnectAll(): Promise<void> {
    for (const udid of this.sessions.keys()) {
      await this.disconnect(udid);
    }
  }

  getActiveSessions(): Array<{ udid: string; createdAt: Date; lastActivity: Date }> {
    return Array.from(this.sessions.entries()).map(([udid, managed]) => ({
      udid,
      createdAt: managed.createdAt,
      lastActivity: managed.lastActivity,
    }));
  }

  hasSession(udid: string): boolean {
    return this.sessions.has(udid);
  }
}

export const mcpSessionManager = new MCPSessionManager();
