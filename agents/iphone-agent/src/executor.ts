import { type Executor, type Session, type SessionConfig } from '@athena-os/executor';
import {
  type Action,
  type ActionResult,
  type ExecutionMetadata,
  type VerificationResult,
  createExecutionMetadata,
  createVerificationResult,
  assertTransition,
} from '@athena-os/core';
import { sessionManager } from './session.js';
import { selectDevice, verifyDeviceReady } from './device.js';
import { verifyWDA } from './wda.js';
import { capabilityFor } from './capabilities/index.js';
import type { CapabilityRunContext } from './capabilities/types.js';
import {
  createLogger,
  DeviceNotReadyError,
  toAthenaError,
  sleep,
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
    const sessionConfig = this.sessionConfig;
    if (!sessionConfig) {
      throw new Error('Executor not initialized. Call initialize() first.');
    }

    // 1. Capability-bound validation + driver context
    const capability = capabilityFor(action.type);
    capability.validate(action);

    const managed = await sessionManager.getSession(this.currentSession.deviceUdid);
    const requestId = generateId();
    const execution = createExecutionMetadata(requestId, action.type);
    execution.state = 'running';
    execution.sessionId = this.currentSession.id;
    execution.deviceUdid = this.currentSession.deviceUdid;

    const maxRetries = sessionConfig.retries ?? 3;
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

      const capabilityContext: CapabilityRunContext = {
        requestId,
        action,
        driver: managed.driver,
        session: this.currentSession,
        config: sessionConfig,
      };

      try {
        const result = await capability.execute(capabilityContext);
        const verification = await capability.verify(capabilityContext, result);
        execution.state = verification.verified ? 'succeeded' : 'failed';

        const finishedAt = new Date();
        execution.finishedAt = finishedAt;
        execution.durationMs = finishedAt.getTime() - execution.startedAt.getTime();

        this.emitTelemetry(execution, verification, action);

        return {
          success: verification.verified,
          action,
          duration: execution.durationMs,
          screenshot: result.screenshot,
          metadata: result.metadata,
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

  private transition(run: PipelineRun, to: ExecutionMetadata['state']): void {
    assertTransition(run.metadata.state, to);
    run.metadata.state = to;
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
      screenshotDir: config?.screenshotDir ?? 'screenshots',
      verifyAppState: config?.verifyAppState ?? false,
      verifyAppLaunch: config?.verifyAppLaunch ?? false,
    };

    const executor = new iPhoneExecutor();
    await executor.initialize(sessionConfig);
    return executor;
  }
}
