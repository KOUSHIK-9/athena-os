import { z } from 'zod';

export const GoalSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  description: z.string(),
});

export type Goal = z.infer<typeof GoalSchema>;

export const ConstraintSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['allow', 'forbid']),
  goalKind: z.string().min(1),
  reason: z.string().default(''),
});

export type Constraint = z.infer<typeof ConstraintSchema>;

export const IntentSchema = z.object({
  id: z.string().min(1),
  text: z.string().optional(),
  goals: z.array(GoalSchema).default([]),
  constraints: z.array(ConstraintSchema).default([]),
});

export type Intent = z.infer<typeof IntentSchema>;

export const CapabilityDescriptorSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  goalKinds: z.array(z.string()),
});

export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>;

export interface CapabilityRegistry {
  capabilities(): readonly CapabilityDescriptor[];
}

export const PlanStepSchema = z.object({
  id: z.string().min(1),
  goalId: z.string(),
  capabilityId: z.string().min(1),
  action: z.string().min(1),
  description: z.string(),
  dependsOn: z.array(z.string()).default([]),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

export const ExecutionPlanSchema = z.object({
  id: z.string().min(1),
  intentId: z.string().min(1),
  steps: z.array(PlanStepSchema),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;