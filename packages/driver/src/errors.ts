import { DriverError, SessionError, ElementNotFoundError, TimeoutError } from '@athena-os/shared';

export class AppiumDriverError extends DriverError {
  constructor(message: string, operation: string, cause?: Error) {
    super(message, operation, cause);
    this.name = 'AppiumDriverError';
  }
}

export class AppiumSessionError extends SessionError {
  constructor(message: string, sessionId: string, cause?: Error) {
    super(message, sessionId, { cause: cause?.message });
    this.name = 'AppiumSessionError';
  }
}

export class AppiumElementNotFoundError extends ElementNotFoundError {
  constructor(selector: string, sessionId: string, triedSelectors: string[], cause?: Error) {
    super(selector, sessionId, { triedSelectors, cause: cause?.message });
    this.name = 'AppiumElementNotFoundError';
  }
}

export class AppiumTimeoutError extends TimeoutError {
  constructor(operation: string, timeout: number, cause?: Error) {
    const error = new TimeoutError(operation, timeout);
    super(operation, timeout);
    this.name = 'AppiumTimeoutError';
    this.message = `${error.message}${cause?.message ? ` (${cause.message})` : ''}`;
  }
}
