import type { SessionConfig, DeviceInfo, Selector } from '@athena-os/core';
import type { Driver, UITree, DriverCapabilities } from './Driver.js';
import { resolveSelector, createFallbackSelectors } from './selectors.js';
import { parseAccessibleXML } from './xml.js';
import { AppiumDriverError, AppiumSessionError, AppiumElementNotFoundError } from './errors.js';
import { createLogger } from '@athena-os/shared';
import { sleep, retry } from '@athena-os/shared';
import { loadDriverConfig, type DriverConfig } from './config.js';

const logger = createLogger('AppiumDriver');

type ElementLike = {
  isExisting(): Promise<boolean>;
  click(): Promise<void>;
  setValue(text: string): Promise<void>;
  swipe(direction: string, opts?: Record<string, unknown>): Promise<void>;
} & Record<string, unknown>;

export class AppiumDriver implements Driver {
  private client: any = null;
  private sessionId: string | null = null;
  private capabilities: DriverCapabilities | null = null;
  private sessionConfig: SessionConfig | null = null;
  private driverConfig: DriverConfig;

  constructor(driverConfig?: DriverConfig) {
    this.driverConfig = driverConfig ?? loadDriverConfig();
  }

  async createSession(config: SessionConfig): Promise<DriverCapabilities> {
    this.sessionConfig = config;

    let remote: unknown;
    try {
      const appiumModule = await import('appium');
      remote = (appiumModule as Record<string, unknown>).remote;
    } catch {
      // fall through - remote stays undefined
    }

    if (typeof remote !== 'function') {
      try {
        const wdioModule = await import('webdriverio');
        remote = (wdioModule as Record<string, unknown>).remote;
      } catch {
        // fall through - remote stays undefined
      }
    }

    if (typeof remote !== 'function') {
      throw new AppiumDriverError(
        "Appium client not found. Ensure the 'appium'/'webdriverio' package is installed with a driver.",
        'createSession'
      );
    }

    const remoteFn = remote as (opts: Record<string, unknown>) => Promise<unknown>;

    const timeoutSeconds = this.driverConfig.timeout ?? config.timeout;
    const retries = this.driverConfig.retries ?? config.retries;
    const udid = this.driverConfig.deviceUdid ?? config.deviceUdid;

    const caps = {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:deviceName': udid,
      'appium:udid': udid,
      'appium:bundleId': config.bundleId,
      'appium:noReset': true,
      'appium:fullReset': false,
      'appium:newCommandTimeout': Math.floor(timeoutSeconds / 1000),
      'appium:xcodeOrgId': this.driverConfig.xcodeTeamId,
      'appium:xcodeSigningId': this.driverConfig.xcodeSigningId,
    };

    for (const key of Object.keys(caps)) {
      if (caps[key as keyof typeof caps] === undefined) {
        delete caps[key as keyof typeof caps];
      }
    }

    logger.debug({ caps }, 'Creating Appium session');

    try {
      this.client = await retry(
        () =>
          remoteFn({
            hostname: this.driverConfig.host,
            port: this.driverConfig.port,
            logLevel: 'silent',
            capabilities: { alwaysMatch: caps },
          }),
        { retries, delay: 2000, backoff: 1.5 }
      );

      this.sessionId = this.client.sessionId;
      this.capabilities = {
        platformName: 'iOS',
        platformVersion: await this.getPlatformVersion(),
        deviceName: await this.getDeviceName(),
        udid: udid || '',
        bundleId: config.bundleId,
      };

      logger.info({ sessionId: this.sessionId }, 'Appium session created');
      return this.capabilities;
    } catch (error) {
      logger.error({ error, config }, 'Failed to create Appium session');
      throw new AppiumSessionError(
        'Failed to create Appium session',
        config.deviceUdid ?? udid ?? 'unknown',
        error instanceof Error ? error : undefined
      );
    }
  }

  async closeSession(): Promise<void> {
    if (this.client) {
      try {
        await this.client.deleteSession();
        logger.info({ sessionId: this.sessionId }, 'Appium session closed');
      } catch (error) {
        logger.warn({ error, sessionId: this.sessionId }, 'Error closing Appium session');
      } finally {
        this.client = null;
        this.sessionId = null;
        this.capabilities = null;
      }
    }
  }

  async launchApp(bundleId: string): Promise<void> {
    this.ensureSession();
    logger.debug({ bundleId }, 'Launching app');

    try {
      await this.client.execute('mobile: launchApp', { bundleId });
    } catch (error) {
      throw new AppiumDriverError(
        `Failed to launch app: ${bundleId}`,
        'launchApp',
        error instanceof Error ? error : undefined
      );
    }
  }

  async terminateApp(bundleId: string): Promise<void> {
    this.ensureSession();
    logger.debug({ bundleId }, 'Terminating app');

    try {
      await this.client.execute('mobile: terminateApp', { bundleId });
    } catch (error) {
      throw new AppiumDriverError(
        `Failed to terminate app: ${bundleId}`,
        'terminateApp',
        error instanceof Error ? error : undefined
      );
    }
  }

  async tap(selector: Selector): Promise<void> {
    this.ensureSession();
    logger.debug({ selector }, 'Tapping element');

    const element = await this.findElementWithFallbacks(selector);
    await element.click();
  }

  async type(text: string, selector?: Selector): Promise<void> {
    this.ensureSession();

    if (selector) {
      logger.debug({ selector, text: text.substring(0, 50) }, 'Typing into element');
      const element = await this.findElementWithFallbacks(selector);
      await element.setValue(text);
    } else {
      logger.debug({ text: text.substring(0, 50) }, 'Typing into active element');
      await this.client.setValue(text);
    }
  }

  async swipe(
    selector: Selector | undefined,
    direction: 'up' | 'down' | 'left' | 'right',
    distance?: number
  ): Promise<void> {
    this.ensureSession();
    logger.debug({ selector, direction, distance }, 'Swiping');

    if (selector) {
      const element = await this.findElementWithFallbacks(selector);
      await element.swipe(direction, { distance: distance ?? 0.5 });
    } else {
      await this.client.execute('mobile: swipe', { direction, distance: distance ?? 0.5 });
    }
  }

  async screenshot(): Promise<Buffer> {
    this.ensureSession();
    logger.debug('Taking screenshot');

    try {
      const base64 = await this.client.takeScreenshot();
      return Buffer.from(base64, 'base64');
    } catch (error) {
      throw new AppiumDriverError(
        'Failed to take screenshot',
        'screenshot',
        error instanceof Error ? error : undefined
      );
    }
  }

  async getUITree(): Promise<UITree> {
    this.ensureSession();
    logger.debug('Getting UI tree');

    try {
      const source = await this.client.getPageSource();
      return this.parseUITree(source);
    } catch (error) {
      throw new AppiumDriverError(
        'Failed to get UI tree',
        'getUITree',
        error instanceof Error ? error : undefined
      );
    }
  }

  async pressHome(): Promise<void> {
    this.ensureSession();
    logger.debug('Pressing home button');

    try {
      await this.client.execute('mobile: pressButton', { name: 'home' });
    } catch (error) {
      throw new AppiumDriverError(
        'Failed to press home button',
        'pressHome',
        error instanceof Error ? error : undefined
      );
    }
  }

  async back(): Promise<void> {
    this.ensureSession();
    logger.debug('Going back');

    try {
      await this.client.back();
    } catch (error) {
      throw new AppiumDriverError(
        'Failed to go back',
        'back',
        error instanceof Error ? error : undefined
      );
    }
  }

  async wait(duration: number): Promise<void> {
    await sleep(duration);
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    this.ensureSession();

    const platformVersion = await this.getPlatformVersion();
    const deviceName = await this.getDeviceName();
    const udid = this.sessionConfig?.deviceUdid ?? '';

    return {
      udid,
      name: deviceName,
      model: await this.getDeviceModel(),
      osVersion: platformVersion,
      isSimulator: false,
      developerMode: true,
    };
  }

  isSessionActive(): boolean {
    return this.client !== null && this.sessionId !== null;
  }

  private ensureSession(): void {
    if (!this.client || !this.sessionId) {
      throw new AppiumSessionError('No active session', this.sessionId ?? 'unknown');
    }
  }

  private async findElementWithFallbacks(selector: Selector): Promise<ElementLike> {
    const fallbacks = createFallbackSelectors(selector);
    let lastError: Error | undefined;

    for (const fallback of fallbacks) {
      const resolved = resolveSelector(fallback);
      logger.trace({ strategy: resolved.strategy, value: resolved.value }, 'Trying selector');

      try {
        const element = (await retry(
          () => this.client.$(`${resolved.strategy}:${resolved.value}`),
          { retries: 2, delay: 500 }
        )) as ElementLike;

        if (await element.isExisting()) {
          logger.debug({ strategy: resolved.strategy }, 'Element found');
          return element;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.trace({ error: lastError.message, strategy: resolved.strategy }, 'Selector failed');
      }
    }

    throw new AppiumElementNotFoundError(
      JSON.stringify(selector),
      this.sessionId ?? 'unknown',
      fallbacks.map(
        (f) => `${f.type}:${'value' in f ? f.value : `${(f as any).x},${(f as any).y}`}`
      ),
      lastError
    );
  }

  private parseUITree(source: string): UITree {
    return parseAccessibleXML(source);
  }

  private async getPlatformVersion(): Promise<string> {
    try {
      return await this.client.getPlatformVersion();
    } catch {
      return 'unknown';
    }
  }

  private async getDeviceName(): Promise<string> {
    try {
      return await this.client.getDeviceName();
    } catch {
      return 'unknown';
    }
  }

  private async getDeviceModel(): Promise<string> {
    try {
      const info = await this.client.execute('mobile: getDeviceInfo');
      return info?.model ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
