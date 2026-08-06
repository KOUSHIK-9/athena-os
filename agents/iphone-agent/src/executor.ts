import { type Executor, type Session, type SessionConfig } from '@athena-os/executor';
import { type Action, type Result, createSuccessResult, createErrorResult } from '@athena-os/core';
import { sessionManager } from './session.js';
import { selectDevice, verifyDeviceReady } from './device.js';
import { verifyWDA } from './wda.js';
import {
  createLogger,
  DeviceNotReadyError,
  toAthenaError,
  retry,
  sleep,
  ValidationError,
} from '@athena-os/shared';

const logger = createLogger('iPhoneExecutor');

const RETRYABLE_ERROR_CODES = new Set([
  'DRIVER_ERROR',
  'SESSION_ERROR',
  'WDA_ERROR',
  'UNKNOWN_ERROR',
  'APP_LAUNCH_ERROR',
  'DEVICE_NOT_CONNECTED',
]);

function isRetryableCode(code: string): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}

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

    this.assertValidAction(action);

    const startTime = Date.now();

    const maxRetries = this.sessionConfig?.retries ?? 3;
    const attempts = maxRetries + 1;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) {
        logger.warn({ action: action.type, attempt }, 'Retrying action after transient failure');
      }

      try {
        const result = await this.runAttempt(action, startTime);
        return result;
      } catch (error) {
        const athenaError = toAthenaError(error);

        if (attempt >= attempts || !isRetryableCode(athenaError.code)) {
          const duration = Date.now() - startTime;
          const screenshot = await this.captureScreenshot(athenaError.code);
          logger.error(
            { action: action.type, attempt, code: athenaError.code, error: athenaError.message },
            'Action failed'
          );
          return createErrorResult(action, duration, athenaError.message, { screenshot });
        }

        await sleep(100 * attempt);
      }
    }

    throw new Error('Unreachable: action loop did not return or throw');
  }

  private assertValidAction(action: Action): void {
    if (action.type === 'launchApp' && !action.bundleId) {
      throw new ValidationError(
        'launchApp requires a bundleId',
        'bundleId',
        action.bundleId ?? null
      );
    }
    if (action.type === 'terminateApp' && !action.bundleId) {
      throw new ValidationError(
        'terminateApp requires a bundleId',
        'bundleId',
        action.bundleId ?? null
      );
    }
    if (action.type === 'tap' && !action.selector) {
      throw new ValidationError('tap requires a selector', 'selector', null);
    }
    if (action.type === 'type' && !action.text) {
      throw new ValidationError('type requires text', 'text', null);
    }
    if (action.type === 'swipe' && !action.selector) {
      throw new ValidationError('swipe requires a selector', 'selector', null);
    }
    if (action.type === 'wait' && (!action.duration || action.duration < 0)) {
      throw new ValidationError(
        'wait requires a non-negative duration',
        'duration',
        action.duration ?? null
      );
    }
  }

  private async runAttempt(action: Action, startTime: number): Promise<Result> {
    let managed;
    try {
      managed = await sessionManager.getSession(this.currentSession!.deviceUdid);
    } catch (error) {
      throw toAthenaError(error);
    }

    const driver = managed.driver;

    let result: Result;

    switch (action.type) {
      case 'launchApp':
        await driver.launchApp(action.bundleId!);
        await this.verifyAppState(action.bundleId!);
        result = createSuccessResult(action, Date.now() - startTime);
        break;

      case 'terminateApp':
        await driver.terminateApp(action.bundleId!);
        result = createSuccessResult(action, Date.now() - startTime);
        break;

      case 'tap':
        await driver.tap(action.selector!);
        result = createSuccessResult(action, Date.now() - startTime);
        break;

      case 'type':
        await driver.type(action.text!, action.selector);
        result = createSuccessResult(action, Date.now() - startTime);
        break;

      case 'swipe':
        await driver.swipe(action.selector!, action.direction, action.distance);
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

      default: {
        const maybeAction = action as { type: string };
        throw new ValidationError(
          `Unknown action type: ${maybeAction.type}`,
          'type',
          maybeAction.type
        );
      }
    }

    return result;
  }

  private async verifyAppState(bundleId: string): Promise<void> {
    if (!this.sessionConfig?.verifyAppState) return;
    try {
      const managed = await sessionManager.getSession(this.currentSession!.deviceUdid);
      const info = await retry(() => managed.driver.getDeviceInfo(), {
        retries: 3,
        delay: 250,
        backoff: 2,
      });
      logger.debug({ bundleId, udid: info.udid }, 'App state verified');
    } catch (error) {
      logger.warn({ bundleId, error }, 'App state verification failed');
    }
  }

  private async captureScreenshot(code: string): Promise<string | undefined> {
    if (!this.sessionConfig?.screenshotOnFailure || code === 'TIMEOUT_ERROR') {
      return undefined;
    }
    if (!this.currentSession) return undefined;

    try {
      const managed = await sessionManager.getSession(this.currentSession.deviceUdid);
      const screenshotBuffer = await managed.driver.screenshot();
      return screenshotBuffer.toString('base64');
    } catch {
      // Ignore screenshot failure
      return undefined;
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
      verifyAppState: config?.verifyAppState ?? false,
    };

    const executor = new iPhoneExecutor();
    await executor.initialize(sessionConfig);
    return executor;
  }
}
