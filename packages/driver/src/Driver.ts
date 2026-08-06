import type { Selector, DeviceInfo, SessionConfig } from '@athena-os/executor';

export interface UITree {
  type: string;
  name?: string;
  label?: string;
  value?: string;
  rect?: { x: number; y: number; width: number; height: number };
  children?: UITree[];
  attributes?: Record<string, string | number | boolean>;
}

export interface DriverCapabilities {
  platformName: string;
  platformVersion: string;
  deviceName: string;
  udid: string;
  bundleId?: string;
  [key: string]: unknown;
}

export interface Driver {
  createSession(config: SessionConfig): Promise<DriverCapabilities>;
  closeSession(): Promise<void>;
  launchApp(bundleId: string): Promise<void>;
  terminateApp(bundleId: string): Promise<void>;
  tap(selector: Selector): Promise<void>;
  type(text: string, selector?: Selector): Promise<void>;
  swipe(
    selector: Selector | undefined,
    direction: 'up' | 'down' | 'left' | 'right',
    distance?: number
  ): Promise<void>;
  screenshot(): Promise<Buffer>;
  getUITree(): Promise<UITree>;
  pressHome(): Promise<void>;
  back(): Promise<void>;
  wait(duration: number): Promise<void>;
  getDeviceInfo(): Promise<DeviceInfo>;
  isSessionActive(): boolean;
}
