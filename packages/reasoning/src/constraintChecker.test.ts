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

  it('rejects goals forbidden by a forbid constraint', () => {
    const constraints: Constraint[] = [
      {
        id: 'c1',
        kind: 'forbid',
        goalKind: 'sendMessage',
        reason: 'messaging is disabled',
      },
    ];
    const result = checker.checkGoals(goals, constraints);
    expect(result.accepted).toEqual([goals[0]]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].goal).toEqual(goals[1]);
    expect(result.rejected[0].reason).toContain('messaging is disabled');
  });

  it('honors an explicit allow override over a forbid constraint', () => {
    const constraints: Constraint[] = [
      { id: 'c1', kind: 'forbid', goalKind: 'sendMessage', reason: 'messaging is disabled' },
      { id: 'c2', kind: 'allow', goalKind: 'sendMessage' },
    ];
    const result = checker.checkGoals(goals, constraints);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toEqual(goals);
  });
});
