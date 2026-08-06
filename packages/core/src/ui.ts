export interface UITree {
  type: string;
  name?: string;
  label?: string;
  value?: string;
  rect?: { x: number; y: number; width: number; height: number };
  children?: UITree[];
  attributes?: Record<string, string | number | boolean>;
}

export interface ScreenState {
  uiTree: UITree;
  screenshot?: Screenshot;
  capturedAt: Date;
}

export interface Screenshot {
  format: 'png' | 'jpeg' | 'heic';
  base64: string;
  width: number;
  height: number;
  capturedAt: Date;
}

export interface DriverCapabilities {
  platformName: string;
  platformVersion: string;
  deviceName: string;
  udid: string;
  bundleId?: string;
  [key: string]: unknown;
}

export type ScreenStateSnapshot = Pick<ScreenState, 'uiTree'> & {
  capturedAt: string;
  screenshot?: Omit<Screenshot, 'capturedAt'>;
};
