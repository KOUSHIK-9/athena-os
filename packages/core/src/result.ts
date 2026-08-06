import { z } from 'zod';
import type { Action } from './action.js';

export const ResultSchema = z.object({
  success: z.boolean(),
  action: z.any(),
  duration: z.number(),
  screenshot: z.string().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.date().default(() => new Date()),
});

export type Result = z.infer<typeof ResultSchema>;

export interface StepResult {
  success: boolean;
  action: Action;
  duration: number;
  screenshot?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export function createSuccessResult(
  action: Action,
  duration: number,
  options?: { screenshot?: string; metadata?: Record<string, unknown> }
): Result {
  return {
    success: true,
    action,
    duration,
    screenshot: options?.screenshot,
    metadata: options?.metadata,
    timestamp: new Date(),
  };
}

export function createErrorResult(
  action: Action,
  duration: number,
  error: string,
  options?: { screenshot?: string; metadata?: Record<string, unknown> }
): Result {
  return {
    success: false,
    action,
    duration,
    error,
    screenshot: options?.screenshot,
    metadata: options?.metadata,
    timestamp: new Date(),
  };
}
