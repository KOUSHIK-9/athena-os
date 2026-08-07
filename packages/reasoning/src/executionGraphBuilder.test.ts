import { describe, expect, it } from 'vitest';
import type { ExecutionPlan, PlanStep } from '@athena-os/core';
import { DeterministicExecutionGraphBuilder } from './executionGraphBuilder.js';

function step(id: string, dependsOn: string[] = []): PlanStep {
  return {
    id,
    goalId: `goal-${id}`,
    capabilityId: `cap-${id}`,
    action: 'execute',
    description: `step ${id}`,
    dependsOn,
  };
}

function plan(...steps: PlanStep[]): ExecutionPlan {
  return { id: 'plan-1', intentId: 'intent-1', steps };
}

const builder = new DeterministicExecutionGraphBuilder();

describe('DeterministicExecutionGraphBuilder', () => {
  it('builds a single-node graph for a plan with one independent step', () => {
    const graph = builder.buildExecutionGraph(plan(step('a')));

    expect(graph.nodes).toEqual([{ stepId: 'a', order: 0, level: 0 }]);
    expect(graph.edges).toEqual([]);
    expect(graph.parallelSets).toEqual([['a']]);
  });

  it('orders a serial chain and assigns increasing levels', () => {
    const graph = builder.buildExecutionGraph(plan(step('a'), step('b', ['a']), step('c', ['b'])));

    expect(graph.nodes.map((n) => n.stepId)).toEqual(['a', 'b', 'c']);
    expect(graph.nodes.map((n) => n.level)).toEqual([0, 1, 2]);
    expect(graph.edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
    expect(graph.parallelSets).toEqual([['a'], ['b'], ['c']]);
  });

  it('groups parallel branches into a single set after the dependency', () => {
    // a → b, a → c, d depends on both: diamond.
    const graph = builder.buildExecutionGraph(
      plan(step('a'), step('b', ['a']), step('c', ['a']), step('d', ['b', 'c']))
    );

    expect(graph.nodes.map((n) => `step-${n.stepId}:${n.level}`)).toEqual([
      'step-a:0',
      'step-b:1',
      'step-c:1',
      'step-d:2',
    ]);
    expect(graph.parallelSets).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('declares independent steps parallel from level 0', () => {
    const graph = builder.buildExecutionGraph(plan(step('a'), step('b')));

    expect(graph.nodes.map((n) => n.level)).toEqual([0, 0]);
    expect(graph.parallelSets).toEqual([['a', 'b']]);
    expect(graph.edges).toEqual([]);
  });

  it('is deterministic: identical plans yield identical graphs', () => {
    const first = builder.buildExecutionGraph(plan(step('a'), step('b', ['a'])));
    const second = builder.buildExecutionGraph(plan(step('a'), step('b', ['a'])));

    expect(first).toEqual(second);
  });
});