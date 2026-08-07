import type { Intent } from '@athena-os/core';
import type { ModelClient, ModelExtraction } from './modelClient.js';

/**
 * In-repo stand-in for a live model, so the whole conformancesuite runs
 * offline with zero API keys (RFC-0012 §Reference Implementation). It has
 * enough "world knowledge" to answer the canonical scenarios, and behaves
 * like a model: it may extract several goals for one phrase ("a weekend
 * trip needs flights and a hotel") or decline an intent it cannot satisfy.
 * A real provider adapter later implements the same port.
 */
export class StubModelClient implements ModelClient {
  readonly id = 'stub';

  extractGoals(intent: Intent): ModelExtraction {
    const text = (intent.text ?? '').trim();
    if (text.length === 0) {
      return { goals: [], clarification: 'intent carries no text to interpret' };
    }

    const lower = text.toLowerCase();

    if (lower.includes('weekend')) {
      return {
        goals: [
          { kind: 'searchFlights', description: text },
          { kind: 'bookHotel', description: text },
        ],
      };
    }

    if (lower.includes('flight')) {
      return { goals: [{ kind: 'searchFlights', description: text }] };
    }

    const verb = text.split(/\s+/)[0]?.toLowerCase() ?? '';
    const fromVerb = KNOWLEDGE[verb];
    if (fromVerb) {
      return { goals: [{ kind: fromVerb, description: text }] };
    }

    return { goals: [], clarification: 'I could not extract any goals from this intent' };
  }
}

/**
 * The stub's notion of what common verbs mean — deliberately shaped like a
 * model's semantic knowledge, kept tiny and fixed (determinism matters for
 * the conformance suite).
 */
const KNOWLEDGE: Record<string, string> = {
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
};
