import {
  type Executor,
  type Action,
  type Result,
  type Session,
  type SessionConfig,
  createSuccessResult,
  createErrorResult,
} from '@athena-os/executor';
import { sessionManager } from './session.js';
import { selectDevice, verifyDeviceReady } from './device.js';
import { verifyWDA } from './wda.js';
import { createLogger, DeviceNotReadyError, toAthenaError } from '@athena-os/shared';

const logger = createLogger('iPhoneExecutor');

export class iPhoneExecutor implements Executor {
  private currentSession: Session | null = null;
  private sessionConfig: SessionConfig | null = null;

  async initialize(config: SessionConfig): Promise<void> {
    this.sessionConfig = config;

    // Verify device is ready
    await verifyDeviceReady(config.deviceUdid);

    // Verify WDA is available
    const wdaStatus = await verifyWDA();
    if (!wdaStatus.xcodeInstalled) {
      throw new DeviceNotReadyError(config.deviceUdid, 'Xcode not installed');
    }

    // Create session via session manager
    const managed = await sessionManager.createSession(config);
    this.currentSession = managed.session;

    logger.info(
      { sessionId: this.currentSession.id, deviceUdid: config.deviceUdid },
      'iPhoneExecutor initialized'
    );
  }

  async execute(action: Action): Promise<Result> {
    if (!this.currentSession) {
      throw new Error('Executor not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    const managed = await sessionManager.getSession(this.currentSession.deviceUdid);
    const driver = managed.driver;

    try {
      let result: Result;

      switch (action.type) {
        case 'launchApp':
          await driver.launchApp(action.bundleId);
          result = createSuccessResult(action, Date.now() - startTime);
          break;

        case 'terminateApp':
          await driver.terminateApp(action.bundleId);
          result = createSuccessResult(action, Date.now() - startTime);
          break;

        case 'tap':
          await driver.tap(action.selector!);
          result = createSuccessResult(action, Date.now() - startTime);
          break;

        case 'type':
          await driver.type(action.text, action.selector);
          result = createSuccessResult(action, Date.now() - startTime);
          break;

        case 'swipe':
          await driver.swipe(action.selector, action.direction, action.distance);
          result = createSuccessResult(action, Date.now() - startTime);
          break;

        case 'screenshot': {
          const screenshot = await driver.screenshot();
          result = createSuccessResult(action, Date.now() - startTime, {
            screenshot: screenshot.toString('base64'),
          });
          break;
        }

        case 'getTree': {
          const tree = await driver.getUITree();
          result = createSuccessResult(action, Date.now() - startTime, {
            metadata: { tree },
          });
          break;
        }

        case 'pressHome':
          await driver.pressHome();
          result = createSuccessResult(action, Date.now() - startTime);
          break;

        case 'back':
          await driver.back();
          result = createSuccessResult(action, Date.now() - startTime);
          break;

        case 'wait':
          await driver.wait(action.duration);
          result = createSuccessResult(action, Date.now() - startTime);
          break;
      }

      return result!;
    } catch (error) {
      const athenaError = toAthenaError(error);
      const duration = Date.now() - startTime;

      let screenshot: string | undefined;
      if (this.sessionConfig?.screenshotOnFailure && athenaError.code !== 'TIMEOUT_ERROR') {
        try {
          const screenshotBuffer = await driver.screenshot();
          screenshot = screenshotBuffer.toString('base64');
        } catch {
          // Ignore screenshot failure
        }
      }

      return createErrorResult(action, duration, athenaError.message, { screenshot });
    }
  }

  getSession(): Session {
    if (!this.currentSession) {
      throw new Error('No active session');
    }
    return this.currentSession;
  }

  async close(): Promise<void> {
    if (this.currentSession) {
      await sessionManager.closeSession(this.currentSession.deviceUdid);
      this.currentSession = null;
      this.sessionConfig = null;
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.currentSession) return false;

    try {
      const managed = await sessionManager.getSession(this.currentSession.deviceUdid);
      return managed.driver.isSessionActive();
    } catch {
      return false;
    }
  }

  static async createWithAutoDevice(config?: Partial<SessionConfig>): Promise<iPhoneExecutor> {
    const device = await selectDevice(config?.deviceUdid, { requireDeveloperMode: true });

    const sessionConfig: SessionConfig = {
      deviceUdid: device.udid,
      bundleId: config?.bundleId,
      timeout: config?.timeout ?? 30000,
      retries: config?.retries ?? 3,
      screenshotOnFailure: config?.screenshotOnFailure ?? true,
    };

    const executor = new iPhoneExecutor();
    await executor.initialize(sessionConfig);
    return executor;
  }
}
