import type { Session, SessionConfig } from './types.js';
import type { Action } from './Action.js';
import type { Result } from './Result.js';

export interface Executor {
  execute(action: Action): Promise<Result>;
  getSession(): Session;
  close(): Promise<void>;
  initialize(config: SessionConfig): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export type { Session, SessionConfig, Selector, DeviceInfo } from './types.js';
export type { Action } from './Action.js';
export type { Result } from './Result.js';
export * from './Action.js';
export * from './Result.js';
