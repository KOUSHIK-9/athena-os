import { describe, expect, it } from 'vitest';
import type { Constraint, Goal } from '@athena-os/core';
import { DeterministicConstraintChecker } from './constraintChecker.js';

const goals: Goal[] = [
  { id: 'g1', kind: 'openApp', description: 'Open Settings' },
  { id: 'g2', kind: 'sendMessage', description: 'Send message to Alice' },
];

describe('DeterministicConstraintChecker', () => {
  const checker = new DeterministicConstraintChecker();

  it('accepts goals when no constraints forbid them', () => {
    const result = checker.checkGoals(goals, []);
    expect(result.accepted).toEqual(goals);
    expect(result.rejected).toEqual([]);
  });

  it('rejects goals forbidden by a hard constraint', () => {
    const constraints: Constraint[] = [
      {
        id: 'c1',
        kind: 'forbid',
        goalKind: 'sendMessage',
        category: 'hard',
        reason: 'messaging is disabled',
      },
    ];
    const result = checker.checkGoals(goals, constraints);
    expect(result.accepted).toEqual([goals[0]]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].goal).toEqual(goals[1]);
    expect(result.rejected[0].reason).toContain('messaging is disabled');
  });

  it('honors an explicit allow override over a hard forbid', () => {
    const constraints: Constraint[] = [
      {
        id: 'c1',
        kind: 'forbid',
        goalKind: 'sendMessage',
        category: 'hard',
        reason: 'messaging is disabled',
      },
      { id: 'c2', kind: 'allow', goalKind: 'sendMessage', category: 'hard' },
    ];
    const result = checker.checkGoals(goals, constraints);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toEqual(goals);
  });

  it('never allows a safety forbid to be overridden', () => {
    const constraints: Constraint[] = [
      {
        id: 'c1',
        kind: 'forbid',
        goalKind: 'sendMessage',
        category: 'safety',
        reason: 'credential exposure',
      },
      { id: 'c2', kind: 'allow', goalKind: 'sendMessage', category: 'hard' },
    ];
    const result = checker.checkGoals(goals, constraints);
    expect(result.accepted).toEqual([goals[0]]);
    expect(result.rejected[0].goal).toEqual(goals[1]);
    expect(result.rejected[0].reason).toContain('credential exposure');
  });

  it('never rejects goals for soft constraints', () => {
    const constraints: Constraint[] = [
      {
        id: 'c1',
        kind: 'forbid',
        goalKind: 'sendMessage',
        category: 'soft',
        reason: 'prefer not at this hour',
      },
    ];
    const result = checker.checkGoals(goals, constraints);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toEqual(goals);
  });

  it('does not evaluate temporal or resource constraints at reasoning time', () => {
    const constraints: Constraint[] = [
      {
        id: 'c1',
        kind: 'forbid',
        goalKind: 'sendMessage',
        category: 'temporal',
        reason: 'deadline 18:00',
      },
      {
        id: 'c2',
        kind: 'forbid',
        goalKind: 'sendMessage',
        category: 'resource',
        reason: 'rate limit',
      },
    ];
    const result = checker.checkGoals(goals, constraints);
    expect(result.rejected).toEqual([]);
  });

  it('matches target-scoped constraints only on the declared target', () => {
    const alice: Goal = { id: 'g1', kind: 'sendMessage', description: 'to Alice', target: 'Alice' };
    const bob: Goal = { id: 'g2', kind: 'sendMessage', description: 'to Bob', target: 'Bob' };
    const constraints: Constraint[] = [
      {
        id: 'c1',
        kind: 'forbid',
        goalKind: 'sendMessage',
        target: 'Alice',
        category: 'safety',
        reason: 'block Alice',
      },
    ];

    const result = checker.checkGoals([alice, bob], constraints);
    expect(result.accepted).toEqual([bob]);
    expect(result.rejected).toEqual([{ goal: alice, reason: 'block Alice (safety)' }]);
  });

  it('reports the constraint category in the rejection reason', () => {
    const constraints: Constraint[] = [
      {
        id: 'c1',
        kind: 'forbid',
        goalKind: 'sendMessage',
        category: 'safety',
        reason: 'no PII via messaging',
      },
    ];
    const result = checker.checkGoals(goals, constraints);
    expect(result.rejected[0].reason).toContain('(safety)');
  });
});
