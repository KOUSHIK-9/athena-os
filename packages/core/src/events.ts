import type { Session } from './device.js';
import type { Result } from './result.js';
import type { Selector } from './selector.js';
import type { ScreenState } from './ui.js';

export const AthenaEventTypes = [
  'SCREENSHOT_TAKEN',
  'APP_LAUNCHED',
  'APP_TERMINATED',
  'ELEMENT_FOUND',
  'ELEMENT_NOT_FOUND',
  'ACTION_STARTED',
  'ACTION_COMPLETED',
  'ACTION_FAILED',
  'SCREEN_STATE_CHANGED',
  'SESSION_CREATED',
  'SESSION_CLOSED',
  'DEVICE_CONNECTED',
  'DEVICE_DISCONNECTED',
] as const;

export type AthenaEventType = (typeof AthenaEventTypes)[number];

export interface AthenaEvent {
  id: string;
  type: AthenaEventType;
  timestamp: Date;
  sessionId?: string;
  deviceUdid?: string;
  payload?: Record<string, unknown>;
}

export interface ScreenshotTakenEvent extends AthenaEvent {
  type: 'SCREENSHOT_TAKEN';
  payload: { screenshot: ScreenState['screenshot']; result?: Result };
}

export interface AppLaunchedEvent extends AthenaEvent {
  type: 'APP_LAUNCHED';
  payload: { bundleId: string; result?: Result };
}

export interface ElementFoundEvent extends AthenaEvent {
  type: 'ELEMENT_FOUND';
  payload: { selector: Selector; result?: Result };
}

export interface ActionCompletedEvent extends AthenaEvent {
  type: 'ACTION_COMPLETED';
  payload: { action: string; result: Result };
}

export interface ActionFailedEvent extends AthenaEvent {
  type: 'ACTION_FAILED';
  payload: { action: string; error: string; result?: Result };
}

export interface SessionCreatedEvent extends AthenaEvent {
  type: 'SESSION_CREATED';
  payload: { session: Session };
}

export type TypedAthenaEvent =
  | ScreenshotTakenEvent
  | AppLaunchedEvent
  | ElementFoundEvent
  | ActionCompletedEvent
  | ActionFailedEvent
  | SessionCreatedEvent;

export interface EventListener {
  (event: AthenaEvent): void;
}

export interface EventEmitter {
  emit(event: AthenaEvent): void;
  on(type: AthenaEventType, listener: EventListener): () => void;
  off(type: AthenaEventType, listener: EventListener): void;
}
