import { type Executor, type Session, type SessionConfig } from '@athena-os/executor';
import {
  type Action,
  type ActionResult,
  type ExecutionMetadata,
  type VerificationResult,
  createVerificationResult,
  createExecutionMetadata,
  assertTransition,
} from '@athena-os/core';
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
  generateId,
} from '@athena-os/shared';

const logger = createLogger('iPhoneExecutor');

const RETRYABLE_ERROR_CODES = new Set([
  'DRIVER_ERROR',
  'SESSION_ERROR',
  'WDA_ERROR',
  'INTERNAL_ERROR',
  'APP_LAUNCH_ERROR',
  'DEVICE_NOT_CONNECTED',
]);

function isRetryableCode(code: string): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}

interface PipelineRun {
  metadata: ExecutionMetadata;
  attempts: number;
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

  async execute(action: Action): Promise<ActionResult> {
    if (!this.currentSession) {
      throw new Error('Executor not initialized. Call initialize() first.');
    }

    // 1. Validation
    this.assertValidAction(action);

    const requestId = generateId();
    const execution = createExecutionMetadata(requestId, action.type);
    execution.state = 'running';
    execution.sessionId = this.currentSession.id;
    execution.deviceUdid = this.currentSession.deviceUdid;

    const maxRetries = this.sessionConfig?.retries ?? 3;
    const attempts = maxRetries + 1;
    const run: PipelineRun = { metadata: execution, attempts: 0 };

    this.transition(run, 'running');

    for (let attempt = 1; attempt <= attempts; attempt++) {
      run.attempts = attempt;
      execution.attempts = attempt;

      if (attempt > 1) {
        logger.warn({ action: action.type, attempt }, 'Retrying action after transient failure');
        this.transition(run, 'retrying');
      }

      try {
        const payload = await this.executeAttempt(action);

        // 4. Verification
        const verification = await this.verify(action, payload);
        execution.state = verification.verified ? 'succeeded' : 'failed';

        const finishedAt = new Date();
        execution.finishedAt = finishedAt;
        execution.durationMs = finishedAt.getTime() - execution.startedAt.getTime();

        this.emitTelemetry(execution, verification, action);

        return {
          success: verification.verified,
          action,
          duration: execution.durationMs,
          screenshot: payload?.screenshot,
          metadata: payload?.metadata,
          error: verification.verified ? undefined : 'Action failed verification',
          requestId,
          state: execution.state,
          execution,
          verification,
          timestamp: finishedAt,
        };
      } catch (error) {
        const athenaError = toAthenaError(error);

        if (attempt >= attempts || !isRetryableCode(athenaError.code)) {
          const finishedAt = new Date();
          execution.finishedAt = finishedAt;
          execution.durationMs = finishedAt.getTime() - execution.startedAt.getTime();
          execution.errorCode = athenaError.code;
          execution.errorMessage = athenaError.message;
          execution.state = 'failed';

          const screenshot = await this.captureScreenshot(athenaError.code);
          const verification = createVerificationResult('none', false, {
            errorCode: athenaError.code,
            errorMessage: athenaError.message,
          });

          logger.error(
            { action: action.type, attempt, code: athenaError.code, error: athenaError.message },
            'Action failed'
          );
          this.emitTelemetry(execution, verification, action);

          return {
            success: false,
            action,
            duration: execution.durationMs,
            screenshot,
            error: athenaError.message,
            requestId,
            state: execution.state,
            execution,
            verification,
            timestamp: finishedAt,
          };
        }

        this.transition(run, 'pending');
        await sleep(100 * attempt);
      }
    }

    throw new Error(`Unreachable: action pipeline did not terminate for ${action.type}`);
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

  private transition(run: PipelineRun, to: ExecutionMetadata['state']): void {
    assertTransition(run.metadata.state, to);
    run.metadata.state = to;
  }

  private async executeAttempt(
    action: Action
  ): Promise<{ screenshot?: string; metadata?: Record<string, unknown> } | undefined> {
    let managed;
    try {
      managed = await sessionManager.getSession(this.currentSession!.deviceUdid);
    } catch (error) {
      throw toAthenaError(error);
    }

    const driver = managed.driver;

    switch (action.type) {
      case 'launchApp':
        await driver.launchApp(action.bundleId!);
        return undefined;

      case 'terminateApp':
        await driver.terminateApp(action.bundleId!);
        return undefined;

      case 'tap':
        await driver.tap(action.selector!);
        return undefined;

      case 'type':
        await driver.type(action.text!, action.selector);
        return undefined;

      case 'swipe':
        await driver.swipe(action.selector!, action.direction, action.distance);
        return undefined;

      case 'screenshot': {
        const screenshotBuffer = await driver.screenshot();
        return { screenshot: screenshotBuffer.toString('base64') };
      }

      case 'getTree': {
        const tree = await driver.getUITree();
        return { metadata: { tree } };
      }

      case 'pressHome':
        await driver.pressHome();
        return undefined;

      case 'back':
        await driver.back();
        return undefined;

      case 'wait':
        await driver.wait(action.duration);
        return undefined;

      default: {
        const maybeAction = action as { type: string };
        throw new ValidationError(
          `Unknown action type: ${maybeAction.type}`,
          'type',
          maybeAction.type
        );
      }
    }
  }

  /** Per-action verification stage. Every action must be verified, not assumed. */
  private async verify(
    action: Action,
    payload?: { screenshot?: string; metadata?: Record<string, unknown> }
  ): Promise<VerificationResult> {
    const sessionHealthy = await this.isSessionHealthy();

    switch (action.type) {
      case 'launchApp':
        return this.verifyLaunched(action.bundleId!);

      case 'screenshot': {
        const verified = Boolean(payload?.screenshot && payload.screenshot.length > 0);
        return createVerificationResult('screenshot-decoded', verified, {
          bytes: payload?.screenshot?.length,
        });
      }

      case 'getTree': {
        const tree = (payload?.metadata?.tree ?? null) as { nodes: unknown[] } | null | undefined;
        const verified = Boolean(tree && Array.isArray(tree.nodes) && tree.nodes.length > 0);
        return createVerificationResult('tree-has-nodes', verified, {
          nodeCount: tree?.nodes?.length,
        });
      }

      default: {
        return createVerificationResult('session-healthy', sessionHealthy, {
          sessionId: this.currentSession?.id,
        });
      }
    }
  }

  private async verifyLaunched(bundleId: string): Promise<VerificationResult> {
    if (!this.sessionConfig?.verifyAppLaunch) {
      return {
        verified: true,
        strategy: 'launch-acknowledged',
        checkedAt: new Date(),
      };
    }

    try {
      await retry(
        async () => {
          const managed = await sessionManager.getSession(this.currentSession!.deviceUdid);
          const healthy = managed.driver.isSessionActive();
          if (!healthy) {
            throw new Error('Session inactive after launch');
          }
        },
        { retries: 3, delay: 250, backoff: 2 }
      );
      return {
        verified: true,
        strategy: 'session-active',
        checkedAt: new Date(),
      };
    } catch (error) {
      logger.warn({ bundleId, error }, 'App launch verification failed');
      return {
        verified: false,
        strategy: 'session-active',
        checkedAt: new Date(),
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private async isSessionHealthy(): Promise<boolean> {
    if (!this.currentSession) return false;
    try {
      const managed = await sessionManager.getSession(this.currentSession.deviceUdid);
      return managed.driver.isSessionActive();
    } catch {
      return false;
    }
  }

  private emitTelemetry(
    execution: ExecutionMetadata,
    verification: VerificationResult,
    action: Action
  ): void {
    logger.info(
      {
        action: action.type,
        startedAt: execution.startedAt.toISOString(),
        durationMs: execution.durationMs,
        attempts: execution.attempts,
        retries: Math.max(0, (execution.attempts ?? 1) - 1),
        verified: verification.verified,
        device: execution.deviceUdid,
        sessionId: execution.sessionId,
        status: execution.state,
        requestId: execution.requestId,
      },
      'action.execute'
    );
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
    return this.isSessionHealthy();
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
      verifyAppLaunch: config?.verifyAppLaunch ?? false,
    };

    const executor = new iPhoneExecutor();
    await executor.initialize(sessionConfig);
    return executor;
  }
}
