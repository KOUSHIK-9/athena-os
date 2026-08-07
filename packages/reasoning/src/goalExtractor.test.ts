import { describe, expect, it } from 'vitest';
import type { Intent } from '@athena-os/core';
import { DeterministicGoalExtractor } from './goalExtractor.js';

function sampleIntent(goals: Intent['goals']): Intent {
  return { id: 'intent-1', goals };
}

describe('DeterministicGoalExtractor', () => {
  const extractor = new DeterministicGoalExtractor();

  it('extracts well-formed goals from an intent', () => {
    const goals = [
      { id: 'g1', kind: 'openApp', description: 'Open Settings' },
      { id: 'g2', kind: 'toggleSetting', description: 'Toggle Wi-Fi' },
    ];
    expect(extractor.extractGoals(sampleIntent(goals))).toEqual(goals);
  });

  it('drops goals with empty kind or description', () => {
    const goals = [
      { id: 'g1', kind: 'openApp', description: 'Open Settings' },
      { id: 'g2', kind: '', description: 'Toggle Wi-Fi' },
      { id: 'g3', kind: 'toggleSetting', description: '' },
    ];
    expect(extractor.extractGoals(sampleIntent(goals))).toEqual([
      { id: 'g1', kind: 'openApp', description: 'Open Settings' },
    ]);
  });

  it('returns an empty array for a goal-less intent', () => {
    expect(extractor.extractGoals(sampleIntent([]))).toEqual([]);
  });
});
