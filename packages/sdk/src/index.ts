export type { Executor } from '@athena-os/executor';

export type {
  Action,
  Result,
  Selector,
  DeviceInfo,
  Session,
  SessionConfig,
  UITree,
  ScreenState,
  Screenshot,
  DriverCapabilities,
  AthenaEvent,
  AthenaEventType,
} from '@athena-os/core';

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
} from '@athena-os/core';

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
} from '@athena-os/core';

export { isAthenaError, toAthenaError } from '@athena-os/core';

export { loadConfig, getConfig, resetConfig, type Config } from '@athena-os/shared';
