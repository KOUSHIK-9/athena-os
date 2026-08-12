import { describe, expect, it } from 'vitest';
import type { Intent } from '@athena-os/core';
import { PROHIBITED_GOAL_KINDS, SYSTEM_PROMPT, parseGoalsJson } from './goalPrompt.js';

const INTENT: Intent = {
  id: 'i-1',
  text: 'Open Settings, search for Fitness, open the result, verify the Fitness screen',
  goals: [],
  constraints: [],
};

describe('Apple planner contract (goalPrompt)', () => {
  it('explicitly forbids verification/observation capabilities in the system prompt', () => {
    const prompt = SYSTEM_PROMPT.toLowerCase();
    for (const kind of ['verify', 'assert', 'check', 'validate', 'confirm', 'observe', 'inspect']) {
      expect(prompt).toContain(`"${kind}"`);
    }
    expect(SYSTEM_PROMPT).toContain('NEVER emit these kinds');
    expect(SYSTEM_PROMPT).toContain('The planner describes HOW to reach the requested state');
    expect(SYSTEM_PROMPT).toContain('executor is responsible for verifying');
  });

  it('exposes the full prohibited kind set', () => {
    expect(PROHIBITED_GOAL_KINDS).toEqual(
      new Set(['verify', 'assert', 'check', 'validate', 'confirm', 'observe', 'inspect'])
    );
  });

  it('drops an Apple-generated verify goal and keeps the actionable goals', () => {
    const text = JSON.stringify({
      goals: [
        { kind: 'openApp', description: 'Open "Settings"' },
        { kind: 'verify', description: 'Verify the Fitness settings screen is displayed' },
        { kind: 'tap', description: 'Tap the Fitness search result' },
      ],
    });
    const extraction = parseGoalsJson(text, INTENT);
    expect(extraction.goals.map((g) => g.kind)).toEqual(['openApp', 'tap']);
  });

  it('drops every prohibited kind (case-insensitive)', () => {
    const text = JSON.stringify({
      goals: Array.from(PROHIBITED_GOAL_KINDS).map((kind) => ({
        kind: kind[0].toUpperCase() + kind.slice(1),
        description: `do ${kind}`,
      })),
    });
    const extraction = parseGoalsJson(text, INTENT);
    expect(extraction.goals).toHaveLength(0);
    expect(extraction.clarification).toBeTruthy();
  });

  it('returns clarification when every goal is non-actionable', () => {
    const text = JSON.stringify({ goals: [{ kind: 'verify', description: 'Verify X' }] });
    const extraction = parseGoalsJson(text, INTENT);
    expect(extraction.goals).toHaveLength(0);
    expect(extraction.clarification).toBeTruthy();
  });

  it('does not register a verify/assert/check capability in an Apple plan (only executable goals survive)', () => {
    const text = JSON.stringify({
      goals: [
        { kind: 'openApp', description: 'Open "Settings"' },
        { kind: 'type', description: 'Type "Fitness"' },
        { kind: 'verify', description: 'Verify it loaded' },
        { kind: 'assert', description: 'Assert visible' },
      ],
    });
    const extraction = parseGoalsJson(text, INTENT);
    for (const goal of extraction.goals) {
      expect(PROHIBITED_GOAL_KINDS.has(goal.kind.toLowerCase())).toBe(false);
    }
  });
});
