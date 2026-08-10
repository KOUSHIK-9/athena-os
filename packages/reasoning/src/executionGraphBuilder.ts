import type { ExecutionGraph, ExecutionGraphNode, ExecutionPlan } from '@athena-os/core';

/**
 * Stage 7: Execution Plan → Execution Graph
 *
 * Computes the dependency graph the plan already declares. The builder is
 * deliberately boring: it does not optimize, does not simulate, does not
 * validate, does not execute (RFC-0011 §1.7).
 *
 * It produces:
 *  - `nodes`: every step, annotated with a global topological `order` and
 *    a `level` (the longest dependency chain beneath it);
 *  - `edges`: the `dependsOn` relations, as `from → to` dependency edges;
 *  - `parallelSets`: steps grouped by `level`. Steps in the same set share
 *    no dependency path and may execute in parallel (RFC-0006 §8,
 *    Execution Semantics).
 *
 * Determinism: steps are processed in declaration order; identical plans
 * always produce identical graphs.
 */
export interface ExecutionGraphBuilder {
  buildExecutionGraph(plan: ExecutionPlan): ExecutionGraph;
}

export class DeterministicExecutionGraphBuilder implements ExecutionGraphBuilder {
  buildExecutionGraph(plan: ExecutionPlan): ExecutionGraph {
    const dependsOn = new Map<string, string[]>(
      plan.steps.map((step) => [step.id, step.dependsOn ?? []])
    );

    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const step of plan.steps) {
      inDegree.set(step.id, (dependsOn.get(step.id) ?? []).length);
      for (const dependency of dependsOn.get(step.id) ?? []) {
        const list = dependents.get(dependency) ?? [];
        list.push(step.id);
        dependents.set(dependency, list);
      }
    }

    const levelOf = new Map<string, number>();
    const order: string[] = [];
    let ready = plan.steps.filter((step) => (inDegree.get(step.id) ?? 0) === 0).map((s) => s.id);

    while (ready.length > 0) {
      const next: string[] = [];
      for (const stepId of ready) {
        order.push(stepId);
        const dependencies = dependsOn.get(stepId) ?? [];
        const level =
          dependencies.reduce((max, dep) => Math.max(max, levelOf.get(dep) ?? 0), -1) + 1;
        levelOf.set(stepId, level);

        for (const dependent of dependents.get(stepId) ?? []) {
          const remaining = (inDegree.get(dependent) ?? 0) - 1;
          inDegree.set(dependent, remaining);
          if (remaining === 0) next.push(dependent);
        }
      }
      ready = next;
    }

    const parallelSets: string[][] = [];
    for (const stepId of order) {
      const level = levelOf.get(stepId) ?? 0;
      if (parallelSets.length <= level) parallelSets.push([]);
      parallelSets[level].push(stepId);
    }

    const nodes: ExecutionGraphNode[] = order.map((stepId, index) => ({
      stepId,
      order: index,
      level: levelOf.get(stepId) ?? 0,
    }));

    const edges = plan.steps.flatMap((step) =>
      (step.dependsOn ?? []).map((dependency) => ({ from: dependency, to: step.id }))
    );

    return {
      planId: plan.id,
      intentId: plan.intentId,
      nodes,
      edges,
      parallelSets,
    };
  }
}
