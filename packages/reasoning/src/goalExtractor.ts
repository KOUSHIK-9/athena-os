import type { Goal, Intent } from '@athena-os/core';

/**
 * Stage 1: Intent → Goal[]
 *
 * Extracts the concrete goals an intent contains. Deterministic and
 * lexicon-based only — no NLP, no LLM.
 *
 * Two sources, in priority order:
 *  1. Structured `intent.goals` (RFC-0005: the Intent declares its goals).
 *  2. `intent.text` verb/target phrases, mapped through a fixed lexicon
 *     (e.g. "Open Settings" → kind `openApp`, target `Settings`).
 *
 * If neither source yields goals, the stage returns an empty array and the
 * engine must ask for clarification (RFC-0009).
 */
export interface GoalExtractor {
  extractGoals(intent: Intent): Goal[];
}

const VERB_LEXICON: Record<string, string> = {
  open: 'openApp',
  launch: 'openApp',
  start: 'openApp',
  foreground: 'openApp',
  send: 'sendMessage',
  reply: 'sendMessage',
  message: 'sendMessage',
  toggle: 'toggleSetting',
  enable: 'toggleSetting',
  disable: 'toggleSetting',
  tap: 'tap',
  click: 'tap',
  press: 'tap',
  select: 'tap',
  type: 'type',
  enter: 'type',
  input: 'type',
  fill: 'type',
  search: 'type',
  back: 'back',
  home: 'home',
};

const LEADING_PREPOSITIONS = new Set(['to', 'in', 'on', 'at', 'for', 'the', 'a', 'an']);

function cleanTarget(raw: string): string {
  const parts = raw.trim().split(/\s+/);
  if (parts.length > 1 && LEADING_PREPOSITIONS.has(parts[0].toLowerCase())) {
    return parts.slice(1).join(' ');
  }
  return parts.join(' ');
}

export class DeterministicGoalExtractor implements GoalExtractor {
  extractGoals(intent: Intent): Goal[] {
    const structured = intent.goals.filter(
      (goal) => goal.kind.length > 0 && goal.description.length > 0
    );
    if (structured.length > 0) {
      return structured;
    }

    if (intent.text && intent.text.length > 0) {
      return this.extractFromText(intent.text);
    }

    return [];
  }

  private extractFromText(text: string): Goal[] {
    const clauses = splitClauses(text);
    const goals: Goal[] = [];

    for (const clause of clauses) {
      const parts = clause.trim().split(/\s+/);
      const verb = parts[0]?.toLowerCase() ?? '';
      const kind = VERB_LEXICON[verb];
      if (!kind) {
        continue;
      }

      const target = cleanTarget(parts.slice(1).join(' '));

      goals.push({
        id: `goal-${goals.length + 1}`,
        kind,
        description: clause.trim(),
        ...(target.length > 0 ? { target } : {}),
      });
    }

    return goals;
  }
}

/** Split a sentence into goal clauses at sequencing conjunctions. */
export function splitClauses(text: string): string[] {
  const parts = text
    .trim()
    .split(/\s+(?:and|then|afterwards|after that)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const deduped: string[] = [];
  for (const part of parts) {
    if (deduped[deduped.length - 1] !== part) {
      deduped.push(part);
    }
  }
  return deduped;
}
