import { z } from 'zod';
import { ActionStateSchema } from './state.js';

export const ExecutionMetadataSchema = z.object({
  requestId: z.string(),
  actionType: z.string(),
  state: ActionStateSchema,
  startedAt: z.date(),
  finishedAt: z.date().optional(),
  durationMs: z.number().optional(),
  attempts: z.number().default(1),
  deviceUdid: z.string().optional(),
  sessionId: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

export type ExecutionMetadata = z.infer<typeof ExecutionMetadataSchema>;

export function createExecutionMetadata(requestId: string, actionType: string): ExecutionMetadata {
  return {
    requestId,
    actionType,
    state: 'pending',
    startedAt: new Date(),
    attempts: 1,
  };
}
