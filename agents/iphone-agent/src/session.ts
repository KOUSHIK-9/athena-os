import type { SessionConfig, Session, DeviceInfo } from '@athena-os/executor';
import { AppiumDriver, type Driver } from '@athena-os/driver';
import { SessionError, SessionExpiredError, createLogger } from '@athena-os/shared';

const logger = createLogger('SessionManager');

interface ManagedSession {
  driver: Driver;
  session: Session;
  deviceInfo: DeviceInfo;
  lastActivity: Date;
  healthCheckInterval?: ReturnType<typeof setInterval>;
}

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private defaultConfig: Partial<SessionConfig> = {
    timeout: 30000,
    retries: 3,
    screenshotOnFailure: true,
  };

  async createSession(config: SessionConfig): Promise<ManagedSession> {
    const udid = config.deviceUdid;

    if (this.sessions.has(udid)) {
      const existing = this.sessions.get(udid)!;
      if (await this.isSessionHealthy(existing)) {
        logger.info({ udid }, 'Reusing existing session');
        existing.lastActivity = new Date();
        return existing;
      } else {
        logger.info({ udid }, 'Existing session unhealthy, creating new one');
        await this.closeSession(udid);
      }
    }

    logger.info({ udid }, 'Creating new Appium session');

    const driver = new AppiumDriver();
    const capabilities = await driver.createSession(config);

    const session: Session = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      deviceUdid: udid,
      capabilities,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    const deviceInfo: DeviceInfo = {
      udid: capabilities.udid,
      name: capabilities.deviceName,
      model: 'iPhone',
      osVersion: capabilities.platformVersion,
      isSimulator: false,
      developerMode: true,
    };

    const managed: ManagedSession = { driver, session, deviceInfo, lastActivity: new Date() };

    // Start health check
    managed.healthCheckInterval = setInterval(async () => {
      if (!(await this.isSessionHealthy(managed))) {
        logger.warn({ udid }, 'Session health check failed, marking for reconnection');
        this.sessions.delete(udid);
        if (managed.healthCheckInterval) {
          clearInterval(managed.healthCheckInterval);
        }
        await managed.driver.closeSession().catch(() => {});
      }
    }, 30000);

    this.sessions.set(udid, managed);
    return managed;
  }

  async getSession(udid: string): Promise<ManagedSession> {
    const managed = this.sessions.get(udid);
    if (!managed) {
      throw new SessionError(`No session found for device: ${udid}`, udid);
    }

    if (!(await this.isSessionHealthy(managed))) {
      logger.warn({ udid }, 'Session unhealthy, attempting reconnection');
      await this.reconnectSession(udid);
      const reconnected = this.sessions.get(udid);
      if (!reconnected) {
        throw new SessionExpiredError(udid);
      }
      return reconnected;
    }

    managed.lastActivity = new Date();
    return managed;
  }

  async closeSession(udid: string): Promise<void> {
    const managed = this.sessions.get(udid);
    if (managed) {
      if (managed.healthCheckInterval) {
        clearInterval(managed.healthCheckInterval);
      }
      await managed.driver.closeSession().catch(() => {});
      this.sessions.delete(udid);
      logger.info({ udid }, 'Session closed');
    }
  }

  async closeAllSessions(): Promise<void> {
    for (const udid of this.sessions.keys()) {
      await this.closeSession(udid);
    }
  }

  private async isSessionHealthy(managed: ManagedSession): Promise<boolean> {
    try {
      return (
        managed.driver.isSessionActive() &&
        (await managed.driver.getDeviceInfo()).udid === managed.session.deviceUdid
      );
    } catch {
      return false;
    }
  }

  private async reconnectSession(udid: string): Promise<void> {
    const managed = this.sessions.get(udid);
    if (!managed) return;

    logger.info({ udid }, 'Attempting to reconnect session');

    try {
      await managed.driver.closeSession();
    } catch {
      // Ignore close failure during reconnect
    }

    // Try to recreate session with same config
    try {
      // We'd need to store the original config for reconnection
      // For now, just remove the session
      this.sessions.delete(udid);
    } catch (error) {
      logger.error({ udid, error }, 'Failed to reconnect session');
    }
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).map((m) => m.session);
  }

  hasSession(udid: string): boolean {
    return this.sessions.has(udid);
  }
}

export const sessionManager = new SessionManager();
