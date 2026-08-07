import { z } from 'zod';

export const GoalSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  description: z.string(),
  target: z.string().optional(),
});

export type Goal = z.infer<typeof GoalSchema>;

export const ConstraintCategorySchema = z.enum([
  'hard',
  'soft',
  'safety',
  'temporal',
  'resource',
]);

export type ConstraintCategory = z.infer<typeof ConstraintCategorySchema>;

export const ConstraintSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['allow', 'forbid']),
  goalKind: z.string().min(1),
  target: z.string().optional(),
  category: ConstraintCategorySchema,
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
  availability: z.enum(['available', 'conditional', 'unavailable']).default('available'),
  requiresResources: z.array(z.string()).default([]),
  reliability: z.number().min(0).max(1).optional(),
});

export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>;

export interface CapabilityRegistry {
  capabilities(): readonly CapabilityDescriptor[];
}

export const SimulationEnvironmentSchema = z.object({
  availableResources: z.array(z.string()).default([]),
});

export type SimulationEnvironment = z.infer<typeof SimulationEnvironmentSchema>;

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

export const ExecutionGraphNodeSchema = z.object({
  stepId: z.string().min(1),
  order: z.number().int().min(0),
  level: z.number().int().min(0),
});

export type ExecutionGraphNode = z.infer<typeof ExecutionGraphNodeSchema>;

export const ExecutionGraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export type ExecutionGraphEdge = z.infer<typeof ExecutionGraphEdgeSchema>;

export const ExecutionGraphSchema = z.object({
  planId: z.string().min(1),
  intentId: z.string().min(1),
  nodes: z.array(ExecutionGraphNodeSchema),
  edges: z.array(ExecutionGraphEdgeSchema),
  parallelSets: z.array(z.array(z.string().min(1))),
});

export type ExecutionGraph = z.infer<typeof ExecutionGraphSchema>;