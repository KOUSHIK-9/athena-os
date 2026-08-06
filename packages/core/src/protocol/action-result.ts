import { z } from 'zod';
import { ResultSchema } from '../result.js';
import { ExecutionMetadataSchema } from './metadata.js';
import { VerificationResultSchema } from './verification.js';

export const ActionResultSchema = ResultSchema.extend({
  requestId: z.string(),
  state: z.enum(['pending', 'running', 'retrying', 'succeeded', 'failed', 'cancelled']),
  execution: ExecutionMetadataSchema.optional(),
  verification: VerificationResultSchema.optional(),
});

export type ActionResult = z.infer<typeof ActionResultSchema>;
