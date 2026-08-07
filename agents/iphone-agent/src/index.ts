export { iPhoneExecutor } from './executor.js';
export {
  capabilityFor,
  allCapabilities,
  type Capability,
  type CapabilityRunContext,
  type CapabilityResultPayload,
  type ActionKind,
} from './capabilities/index.js';
export { launchCapability } from './capabilities/launch.js';
export { terminateCapability } from './capabilities/terminate.js';
export { tapCapability } from './capabilities/tap.js';
export { typeCapability } from './capabilities/type.js';
export { scrollCapability } from './capabilities/scroll.js';
export { homeCapability } from './capabilities/home.js';
export { backCapability } from './capabilities/back.js';
export { waitCapability } from './capabilities/wait.js';
export { screenshotCapability } from './capabilities/screenshot.js';
export { treeCapability } from './capabilities/tree.js';
export { SessionManager, sessionManager } from './session.js';
export { selectDevice, discoverDevices, getDeviceInfo, verifyDeviceReady } from './device.js';
export { resolveAppNameToBundleId, resolveKnownAppBundleId } from './apps.js';
export {
  parsePng,
  buildScreenshotMetadata,
  makeScreenshotPath,
  screenshotFilename,
  saveAndVerifyScreenshot,
  verifyScreenshotFile,
  type PngInfo,
  type ScreenshotMetadata,
  type SavedScreenshot,
} from './screenshot.js';
export { verifyWDA, buildWDA, installWDA, launchWDA, type WDAStatus } from './wda.js';
export { iPhoneAgentError, DeviceSelectionError, WDAVerificationError } from './errors.js';
export { AppiumDriver } from '@athena-os/driver';
export type { Driver } from '@athena-os/driver';
export type * from '@athena-os/core';
export type { Executor } from '@athena-os/executor';
