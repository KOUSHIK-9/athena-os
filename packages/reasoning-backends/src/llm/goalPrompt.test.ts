import { describe, expect, it } from 'vitest';
import type { Intent } from '@athena-os/core';
import {
  PROHIBITED_GOAL_KINDS,
  SYSTEM_PROMPT,
  filterGoalsToContext,
  goalExtractionInstructions,
  parseGoalsJson,
} from './goalPrompt.js';
import type { ModelExtractionContext } from './modelClient.js';

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

  it('registry-aware instructions inject only the available goal kinds + capability reference', () => {
    const ctx: ModelExtractionContext = {
      availableGoalKinds: ['searchFlights', 'bookHotel'],
      capabilities: [
        {
          id: 'flights-search',
          description: 'Search flight itineraries',
          goalKinds: ['searchFlights'],
        },
        { id: 'hotels-search', description: 'Find hotel options', goalKinds: ['bookHotel'] },
      ],
    };
    const instructions = goalExtractionInstructions(ctx);
    expect(instructions).toContain('searchFlights');
    expect(instructions).toContain('bookHotel');
    expect(instructions).toContain('Search flight itineraries');
    expect(instructions).toContain('Find hotel options');
    expect(instructions).toContain('Prefer the highest-level capability');
    // The static fallback vocabulary must not leak in.
    expect(instructions).not.toContain('openApp": launch');
  });

  it('filterGoalsToContext keeps only registry-supported kinds', () => {
    const ctx: ModelExtractionContext = { availableGoalKinds: ['searchFlights'] };
    const goals = filterGoalsToContext(
      [
        { kind: 'searchFlights', description: 'Search flights' },
        { kind: 'tap', description: 'Tap result' },
        { kind: 'type', description: 'Type Tokyo' },
      ],
      ctx
    );
    expect(goals.map((g) => g.kind)).toEqual(['searchFlights']);
  });

  it('filterGoalsToContext is a no-op without a context', () => {
    const goals = filterGoalsToContext([
      { kind: 'openApp', description: 'Open "Settings"' },
      { kind: 'tap', description: 'Tap X' },
    ]);
    expect(goals).toHaveLength(2);
  });

  it('parses JSON wrapped in a fenced block with surrounding prose', () => {
    const content =
      'Here is the extraction:\n```json\n' +
      JSON.stringify({ goals: [{ kind: 'searchFlights', description: 'Search flights' }] }) +
      '\n```\nLet me know if you need anything else.';
    const extraction = parseGoalsJson(content, INTENT);
    expect(extraction.goals.map((g) => g.kind)).toEqual(['searchFlights']);
  });
});
