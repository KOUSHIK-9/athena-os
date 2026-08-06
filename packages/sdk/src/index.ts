export type {
  Executor,
  Action,
  Result,
  Selector,
  DeviceInfo,
  Session,
  SessionConfig,
} from '@athena-os/executor';

export {
  createLaunchAppAction,
  createTapAction,
  createTypeAction,
  createScreenshotAction,
  createGetTreeAction,
  createPressHomeAction,
  createTerminateAppAction,
  createSwipeAction,
  createWaitAction,
  createBackAction,
  createSuccessResult,
  createErrorResult,
} from '@athena-os/executor';

export type {
  AthenaError,
  DeviceNotConnectedError,
  DeviceNotFoundError,
  DeviceNotReadyError,
  SessionError,
  SessionExpiredError,
  ElementNotFoundError,
  AppLaunchError,
  ActionExecutionError,
  TimeoutError,
  ConfigurationError,
  ValidationError,
  DriverError,
  WebDriverAgentError,
} from '@athena-os/shared';

export { isAthenaError, toAthenaError } from '@athena-os/shared';

export { loadConfig, getConfig, resetConfig, type Config } from '@athena-os/shared';
