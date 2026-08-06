export type { Driver, UITree, DriverCapabilities } from './Driver.js';
export { AppiumDriver } from './AppiumDriver.js';
export {
  resolveSelector,
  getSelectorPriority,
  sortSelectors,
  createFallbackSelectors,
} from './selectors.js';
export {
  AppiumDriverError,
  AppiumSessionError,
  AppiumElementNotFoundError,
  AppiumTimeoutError,
} from './errors.js';
