export class AthenaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AthenaError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack,
    };
  }
}

export class ValidationError extends AthenaError {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown
  ) {
    super(message, 'VALIDATION_ERROR', 400, { field, value });
    this.name = 'ValidationError';
  }
}

export class DeviceError extends AthenaError {
  constructor(
    message: string,
    code: string,
    statusCode: number,
    public readonly udid: string,
    details?: Record<string, unknown>
  ) {
    super(message, code, statusCode, { udid, ...details });
    this.name = 'DeviceError';
  }
}

export class DeviceNotConnectedError extends DeviceError {
  constructor(udid: string, reason?: string) {
    super(
      `Device not connected: ${udid}${reason ? ` (${reason})` : ''}`,
      'DEVICE_NOT_CONNECTED',
      404,
      udid,
      { reason }
    );
    this.name = 'DeviceNotConnectedError';
  }
}

export class DeviceNotFoundError extends DeviceError {
  constructor(udid: string) {
    super(`Device not found: ${udid}`, 'DEVICE_NOT_FOUND', 404, udid);
    this.name = 'DeviceNotFoundError';
  }
}

export class DeviceNotReadyError extends DeviceError {
  constructor(udid: string, reason: string) {
    super(`Device not ready: ${reason}`, 'DEVICE_NOT_READY', 409, udid, { reason });
    this.name = 'DeviceNotReadyError';
  }
}

export class DriverError extends AthenaError {
  constructor(
    message: string,
    public readonly driverOperation: string,
    cause?: Error
  ) {
    super(message, 'DRIVER_ERROR', 500, { driverOperation, cause: cause?.message });
    this.name = 'DriverError';
  }
}

export class SessionError extends AthenaError {
  constructor(
    message: string,
    public readonly sessionId: string,
    details?: Record<string, unknown>,
    code = 'SESSION_ERROR',
    statusCode = 500
  ) {
    super(message, code, statusCode, { sessionId, ...details });
    this.name = 'SessionError';
  }
}

export class SessionExpiredError extends SessionError {
  constructor(sessionId: string) {
    super(`Session expired: ${sessionId}`, sessionId, undefined, 'SESSION_EXPIRED', 410);
    this.name = 'SessionExpiredError';
  }
}

export class ElementNotFoundError extends AthenaError {
  constructor(
    selector: string,
    public readonly sessionId: string,
    details?: Record<string, unknown>
  ) {
    super(`Element not found: ${selector}`, 'ELEMENT_NOT_FOUND', 404, {
      selector,
      sessionId,
      ...details,
    });
    this.name = 'ElementNotFoundError';
  }
}

export class ActionError extends AthenaError {
  constructor(
    message: string,
    code: string,
    public readonly action: string,
    details?: Record<string, unknown>
  ) {
    super(message, code, 500, { action, ...details });
    this.name = 'ActionError';
  }
}

export class AppLaunchError extends ActionError {
  constructor(
    bundleId: string,
    public readonly sessionId: string,
    cause?: Error
  ) {
    super(`Failed to launch app: ${bundleId}`, 'APP_LAUNCH_ERROR', 'launchApp', {
      bundleId,
      sessionId,
      cause: cause?.message,
    });
    this.name = 'AppLaunchError';
  }
}

export class ActionExecutionError extends ActionError {
  constructor(
    action: string,
    public readonly sessionId: string,
    cause?: Error
  ) {
    super(`Action failed: ${action}`, 'ACTION_EXECUTION_ERROR', action, {
      sessionId,
      cause: cause?.message,
    });
    this.name = 'ActionExecutionError';
  }
}

export class TimeoutError extends AthenaError {
  constructor(operation: string, timeout: number) {
    super(`Operation timed out: ${operation} (${timeout}ms)`, 'TIMEOUT_ERROR', 408, {
      operation,
      timeout,
    });
    this.name = 'TimeoutError';
  }
}

export class ConfigurationError extends AthenaError {
  constructor(
    message: string,
    public readonly configKey: string
  ) {
    super(message, 'CONFIGURATION_ERROR', 500, { configKey });
    this.name = 'ConfigurationError';
  }
}

export class InternalError extends AthenaError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'INTERNAL_ERROR', 500, details);
    this.name = 'InternalError';
  }
}

export class WebDriverAgentError extends AthenaError {
  constructor(
    message: string,
    public readonly udid: string,
    cause?: Error
  ) {
    super(message, 'WDA_ERROR', 500, { udid, cause: cause?.message });
    this.name = 'WebDriverAgentError';
  }
}

export function isAthenaError(error: unknown): error is AthenaError {
  return error instanceof AthenaError;
}

export function toAthenaError(error: unknown): AthenaError {
  if (isAthenaError(error)) return error;
  if (error instanceof Error) {
    return new InternalError(error.message, { originalError: error.name });
  }
  return new InternalError(String(error));
}
