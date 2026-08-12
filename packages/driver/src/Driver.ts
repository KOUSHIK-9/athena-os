import type {
  Selector,
  DeviceInfo,
  SessionConfig,
  UITree,
  DriverCapabilities,
  ActiveApp,
} from '@athena-os/core';

export type { UITree, DriverCapabilities, ActiveApp } from '@athena-os/core';

export interface Driver {
  createSession(config: SessionConfig): Promise<DriverCapabilities>;
  closeSession(): Promise<void>;
  launchApp(bundleId: string): Promise<void>;
  terminateApp(bundleId: string): Promise<void>;
  /** The application currently foreground on the device, if determinable. */
  getActiveApp(): Promise<ActiveApp | undefined>;
  tap(selector: Selector): Promise<void>;
  type(text: string, selector?: Selector): Promise<void>;
  swipe(
    selector: Selector | undefined,
    direction: 'up' | 'down' | 'left' | 'right',
    distance?: number
  ): Promise<void>;
  screenshot(): Promise<Buffer>;
  getUITree(): Promise<UITree>;
  sourceContains(text: string, timeoutMs?: number): Promise<boolean>;
  pressHome(): Promise<void>;
  back(): Promise<void>;
  wait(duration: number): Promise<void>;
  getDeviceInfo(): Promise<DeviceInfo>;
  isSessionActive(): boolean;
}
