import type { Action, ActiveApp, Result, Session, SessionConfig } from '@athena-os/core';

export interface Executor {
  execute(action: Action): Promise<Result>;
  getSession(): Session;
  close(): Promise<void>;
  initialize(config: SessionConfig): Promise<void>;
  isHealthy(): Promise<boolean>;
  /** The application currently foreground on the device, if the driver can report it. */
  getActiveApp?(): Promise<ActiveApp | undefined>;
}
