import type {
  CapabilityRegistry,
  ExecutionPlan,
  PlanStep,
} from '@athena-os/core';

export type DiagnosticSeverity = 'error' | 'warning' | 'suggestion';
export type ValidationPhase = 'structural' | 'semantic';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  phase: ValidationPhase;
  code: string;
  message: string;
  stepId?: string;
}

export interface TraceEntry {
  code: string;
  detail: string;
  outcome: 'passed' | 'failed';
}

export interface PlanValidationResult {
  valid: boolean;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  suggestions: Diagnostic[];
  trace: TraceEntry[];
}

/**
 * Stage 5: Execution Plan → Diagnostics
 *
 * A compiler-like validator. It never mutates the plan — it only reports.
 * Outputs `valid`, `errors`, `warnings`, `suggestions`, and a `trace` of
 * the checks that ran.
 *
 * Validation is phased, mirroring a compiler (parse, then type check):
 *  - `structural` (current): RFC-0006 structural + capability validity.
 *  - `semantic` (future): RFC-0006 §4–§8, RFC-0007 constraint compliance,
 *    RFC-0008 decision points, RFC-0009 reasoning guarantees. The door is
 *    open; the checks are not yet implemented.
 */
export interface PlanValidator {
  validatePlan(
    plan: ExecutionPlan,
    registry: CapabilityRegistry
  ): PlanValidationResult;
}

export class DeterministicPlanValidator implements PlanValidator {
  validatePlan(
    plan: ExecutionPlan,
    registry: CapabilityRegistry
  ): PlanValidationResult {
    const errors: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];
    const suggestions: Diagnostic[] = [];
    const trace: TraceEntry[] = [];

    const capabilityIds = new Set(registry.capabilities().map((c) => c.id));
    const byId = new Map<string, PlanStep>();
    plan.steps.forEach((step) => byId.set(step.id, step));

    // PLAN_EMPTY
    if (plan.steps.length === 0) {
      errors.push({
        severity: 'error',
        phase: 'structural',
        code: 'PLAN_EMPTY',
        message: 'execution plan contains no steps',
      });
      trace.push({ code: 'PLAN_EMPTY', detail: 'no steps to validate', outcome: 'failed' });
    } else {
      trace.push({ code: 'PLAN_EMPTY', detail: 'plan has steps', outcome: 'passed' });
    }

    // STEP_DUPLICATE_ID (iterate the raw array: a Map would collapse dupes)
    const seen = new Set<string>();
    let duplicateIds = false;
    for (const step of plan.steps) {
      if (seen.has(step.id)) {
        errors.push({
          severity: 'error',
          phase: 'structural',
          code: 'STEP_DUPLICATE_ID',
          stepId: step.id,
          message: `duplicate step id '${step.id}'`,
        });
        duplicateIds = true;
      }
      seen.add(step.id);
    }
    trace.push({
      code: 'STEP_DUPLICATE_ID',
      detail: duplicateIds ? 'duplicate step ids found' : 'all step ids unique',
      outcome: duplicateIds ? 'failed' : 'passed',
    });

    // STEP_UNKNOWN_CAPABILITY (iterate the raw array: a Map would collapse
    // duplicates and hide steps from this check)
    let unknownCapability = false;
    for (const step of plan.steps) {
      if (!capabilityIds.has(step.capabilityId)) {
        errors.push({
          severity: 'error',
          phase: 'structural',
          code: 'STEP_UNKNOWN_CAPABILITY',
          stepId: step.id,
          message: `step references unknown capability '${step.capabilityId}'`,
        });
        unknownCapability = true;
      }
    }
    trace.push({
      code: 'STEP_UNKNOWN_CAPABILITY',
      detail: unknownCapability ? 'unknown capability referenced' : 'all capabilities registered',
      outcome: unknownCapability ? 'failed' : 'passed',
    });

    // STEP_UNKNOWN_DEPENDENCY
    let unknownDependency = false;
    for (const step of plan.steps) {
      for (const dependency of step.dependsOn) {
        if (!byId.has(dependency)) {
          errors.push({
            severity: 'error',
            phase: 'structural',
            code: 'STEP_UNKNOWN_DEPENDENCY',
            stepId: step.id,
            message: `step depends on unknown step '${dependency}'`,
          });
          unknownDependency = true;
        }
      }
    }
    trace.push({
      code: 'STEP_UNKNOWN_DEPENDENCY',
      detail: unknownDependency ? 'unknown dependencies found' : 'all dependencies resolve',
      outcome: unknownDependency ? 'failed' : 'passed',
    });

    // PLAN_CYCLIC (RFC-0006 §1: the plan graph is a DAG)
    const { cyclic, cycle } = detectCycle(plan.steps);
    if (cyclic) {
      errors.push({
        severity: 'error',
        phase: 'structural',
        code: 'PLAN_CYCLIC',
        message: `dependency graph contains a cycle: ${cycle}`,
      });
    }
    trace.push({
      code: 'PLAN_CYCLIC',
      detail: cyclic ? `cycle detected: ${cycle}` : 'dependency graph is acyclic',
      outcome: cyclic ? 'failed' : 'passed',
    });

    // STEP_OUT_OF_ORDER (warning): a dependency on a later-declared step
    // signals that declared order and execution order may disagree.
    const order = new Map<string, number>();
    plan.steps.forEach((s, i) => order.set(s.id, i));
    for (const step of plan.steps) {
      const stepIndex = order.get(step.id) ?? 0;
      for (const dependency of step.dependsOn) {
        const depIndex = order.get(dependency);
        if (depIndex !== undefined && depIndex > stepIndex) {
          warnings.push({
            severity: 'warning',
            phase: 'structural',
            code: 'STEP_OUT_OF_ORDER',
            stepId: step.id,
            message: `step depends on '${dependency}', declared later in the plan`,
          });
          break;
        }
      }
    }

    // STEP_TRANSITIVE_DEPENDENCY (suggestion): an edge already implied by a
    // chain of other edges is redundant and can be removed without changing
    // the plan's semantics.
    for (const step of plan.steps) {
      for (const dependency of step.dependsOn) {
        if (isTransitivelyReachable(step.id, dependency, plan.steps)) {
          suggestions.push({
            severity: 'suggestion',
            phase: 'structural',
            code: 'STEP_TRANSITIVE_DEPENDENCY',
            stepId: step.id,
            message: `dependency on '${dependency}' is already implied by other steps`,
          });
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings, suggestions, trace };
  }
}

function adjacent(steps: PlanStep[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const step of steps) graph.set(step.id, [...step.dependsOn]);
  return graph;
}

function detectCycle(steps: PlanStep[]): { cyclic: boolean; cycle: string } {
  const graph = adjacent(steps);
  const state = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];

  const visit = (id: string): boolean => {
    const current = state.get(id);
    if (current === 'visited') return false;
    if (current === 'visiting') return true;
    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of graph.get(id) ?? []) {
      if (visit(dep)) return true;
    }
    stack.pop();
    state.set(id, 'visited');
    return false;
  };

  for (const id of graph.keys()) {
    if (visit(id)) {
      return { cyclic: true, cycle: [...stack].join(' → ') };
    }
  }
  return { cyclic: false, cycle: '' };
}

/**
 * True if `target` is reachable from `from` via a path of **length ≥ 2**
 * through other declared steps (i.e. the direct edge is redundant).
 * The direct edge itself is never counted.
 */
function isTransitivelyReachable(from: string, target: string, steps: PlanStep[]): boolean {
  const graph = adjacent(steps);
  const visited = new Set<string>([from]);
  const queue = [...(graph.get(from) ?? [])];

  while (queue.length > 0) {
    const next = queue.shift()!;
    if (next === target) continue;
    if (visited.has(next)) continue;
    visited.add(next);
    const reachable = (graph.get(next) ?? []).some((n) => n === target);
    if (reachable) return true;
    queue.push(...(graph.get(next) ?? []));
  }
  return false;
}

export function isPlanValid(result: PlanValidationResult): boolean {
  return result.valid;
}

export type { PlanStep };