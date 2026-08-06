import { z } from 'zod';
import { ActionSchema } from '../action.js';

export const ExecutionRequestSchema = z.object({
  id: z.string(),
  action: ActionSchema,
  createdAt: z.date().default(() => new Date()),
});

export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

export const ExecutionContextSchema = z.object({
  requestId: z.string(),
  action: ActionSchema,
  sessionId: z.string().optional(),
  deviceUdid: z.string().optional(),
  startedAt: z.date().default(() => new Date()),
  maxRetries: z.number().default(3),
  timeoutMs: z.number().default(30000),
});

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
