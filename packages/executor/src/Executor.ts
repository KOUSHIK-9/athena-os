import type { Action, Result, Session, SessionConfig } from '@athena-os/core';

export interface Executor {
  execute(action: Action): Promise<Result>;
  getSession(): Session;
  close(): Promise<void>;
  initialize(config: SessionConfig): Promise<void>;
  isHealthy(): Promise<boolean>;
}
