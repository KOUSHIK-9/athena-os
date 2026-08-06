import { z } from 'zod';

export const VerificationResultSchema = z.object({
  verified: z.boolean(),
  strategy: z.string(),
  details: z.record(z.unknown()).optional(),
  checkedAt: z.date().default(() => new Date()),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export function createVerificationResult(
  strategy: string,
  verified: boolean,
  details?: Record<string, unknown>
): VerificationResult {
  return {
    verified,
    strategy,
    details,
    checkedAt: new Date(),
  };
}
