import { z } from 'zod';

export const ActionStateSchema = z.enum([
  'pending',
  'running',
  'retrying',
  'succeeded',
  'failed',
  'cancelled',
]);

export type ActionState = z.infer<typeof ActionStateSchema>;

export const ACTION_STATES: readonly ActionState[] = [
  'pending',
  'running',
  'retrying',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export const TRANSITIONS: Record<ActionState, ReadonlySet<ActionState>> = {
  pending: new Set(['running', 'cancelled']),
  running: new Set(['running', 'retrying', 'succeeded', 'failed', 'cancelled', 'pending']),
  retrying: new Set(['running', 'failed', 'cancelled']),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export function canTransition(from: ActionState, to: ActionState): boolean {
  return TRANSITIONS[from].has(to);
}

export function assertTransition(from: ActionState, to: ActionState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid action state transition: ${from} -> ${to}`);
  }
}
