import { describe, expect, it } from 'vitest';
import type { Intent } from '@athena-os/core';
import { DeterministicGoalExtractor } from './goalExtractor.js';

function sampleIntent(overrides: Partial<Intent> = {}): Intent {
  return { id: 'intent-1', goals: [], ...overrides };
}

describe('DeterministicGoalExtractor', () => {
  const extractor = new DeterministicGoalExtractor();

  describe('structured goals', () => {
    it('extracts well-formed goals from an intent', () => {
      const goals = [
        { id: 'g1', kind: 'openApp', description: 'Open Settings' },
        { id: 'g2', kind: 'toggleSetting', description: 'Toggle Wi-Fi' },
      ];
      expect(extractor.extractGoals(sampleIntent({ goals }))).toEqual(goals);
    });

    it('drops goals with empty kind or description', () => {
      const goals = [
        { id: 'g1', kind: 'openApp', description: 'Open Settings' },
        { id: 'g2', kind: '', description: 'Toggle Wi-Fi' },
        { id: 'g3', kind: 'toggleSetting', description: '' },
      ];
      expect(extractor.extractGoals(sampleIntent({ goals }))).toEqual([
        { id: 'g1', kind: 'openApp', description: 'Open Settings' },
      ]);
    });

    it('returns an empty array for a goal-less intent', () => {
      expect(extractor.extractGoals(sampleIntent())).toEqual([]);
    });
  });

  describe('text extraction (verb lexicon)', () => {
    it('maps "Open Settings" to an openApp goal with target', () => {
      const goals = extractor.extractGoals(sampleIntent({ text: 'Open Settings' }));
      expect(goals).toEqual([
        {
          id: 'goal-1',
          kind: 'openApp',
          description: 'Open Settings',
          target: 'Settings',
        },
      ]);
    });

    it('maps "reply to Alice" to a sendMessage goal with a cleaned target', () => {
      const goals = extractor.extractGoals(sampleIntent({ text: 'reply to Alice' }));
      expect(goals).toEqual([
        {
          id: 'goal-1',
          kind: 'sendMessage',
          description: 'reply to Alice',
          target: 'Alice',
        },
      ]);
    });

    it('is case-insensitive on the verb', () => {
      const goals = extractor.extractGoals(sampleIntent({ text: 'OPEN Settings' }));
      expect(goals[0].kind).toBe('openApp');
    });

    it('returns no goals for an unknown verb (clarification seam)', () => {
      const goals = extractor.extractGoals(sampleIntent({ text: 'fly to Tokyo' }));
      expect(goals).toEqual([]);
    });

    it('maps a single-word phrase without a target', () => {
      const goals = extractor.extractGoals(sampleIntent({ text: 'reply' }));
      expect(goals[0].target).toBeUndefined();
    });
  });
});
