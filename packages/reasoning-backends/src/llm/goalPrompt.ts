import type { Intent } from '@athena-os/core';
import { z } from 'zod';
import type { ExtractedGoal, ModelExtraction, ModelExtractionContext } from './modelClient.js';

/**
 * Shared goal-extraction prompt/parser for every `ModelClient`
 * (OpenAI-compatible remote, Apple on-device, ...). Keeping the prompt
 * and the output schema identical across providers is what makes backend
 * comparison (RFC-0012 #conformance) apples-to-apples.
 */

export const MAX_GOALS = 16;

export const GOALS_PAYLOAD_SCHEMA = z.object({
  goals: z
    .array(z.object({ kind: z.string().min(1), description: z.string().default('') }))
    .max(MAX_GOALS),
  clarification: z.string().optional(),
});

/**
 * Goal kinds the planner must NEVER emit. These are not planning actions —
 * verification and observation of the final state are performed automatically
 * by Athena's executor and recovery layers after each action. Allowing them
 * would create goals with no registered capability and force the backend to
 * bail out with `clarificationRequired`.
 */
export const PROHIBITED_GOAL_KINDS = new Set<string>([
  'verify',
  'assert',
  'check',
  'validate',
  'confirm',
  'observe',
  'inspect',
]);

/**
 * Prompt body shared by every backend. The allowed-goal-kinds section is
 * injected by `goalExtractionInstructions` so the model is told exactly
 * which kinds the active registry can satisfy (registry-aware extraction).
 * When no context is supplied it falls back to the canonical static list.
 */
const BASE_RULES = [
  'You are Athena, a goal extractor for a cognitive execution platform that drives a real iPhone through its UI.',
  'Analyze the user intent and decompose it into discrete, ordered goal steps — one goal per distinct device interaction.',
  'Return ONLY a JSON object of the form',
  '{"goals":[{"kind":"<goal kind>","description":"<description>"}],"clarification":"<optional reason>"}.',
  '',
  'Rules:',
  '- Emit ONE goal per verb/action in the task. A multi-step task (open app, search, tap result) MUST produce',
  '  multiple goals. Never collapse several actions into a single goal — if the user lists 4 things to do, return ~4 goals.',
  "- Preserve the user's concrete targets verbatim in each description: quoted element labels, app names, and text to enter",
  '  must appear exactly as written (e.g. Tap "Continue" stays Tap "Continue"). Do not paraphrase away the target.',
  '- Put the concrete target inside DOUBLE QUOTES for every goal that names one, and copy it VERBATIM',
  '  from the user intent (or, for UI elements, the exact visible label). Never describe the target in prose:',
  '  - openApp:  Open "<exact app name>"        e.g. Open "Settings"',
  '  - tap:      Tap "<exact visible label>"     e.g. Tap "Search"  (NOT "tap the search field" or "tap the result")',
  '  - type:     Type "<exact text to enter>"    e.g. Type "Fitness"',
  '  A quoted, exact target lets the executor resolve it on screen. A prose description forces a guess and',
  '  usually fails, so always quote the precise target.',
  '- NEVER emit these kinds — they are NOT planning actions and Athena has no capability for them:',
  '  "verify", "assert", "check", "validate", "confirm", "observe", "inspect".',
  "  Verification and observation are performed automatically by Athena's executor and recovery layers AFTER each action.",
  '- The planner describes HOW to reach the requested state. The executor is responsible for verifying that the',
  '  requested final state was reached. If the user asks to "verify X is displayed", plan the actions that reach X;',
  '  do NOT emit a "verify" goal.',
  '- If the intent is truly ambiguous or unfulfillable, return {"goals":[],"clarification":"<why>"}; otherwise ALWAYS return goals.',
  '',
  'Example — intent "Open Settings, search for Fitness, open the result, verify the Fitness screen":',
  '{',
  '  "goals": [',
  '    {"kind":"openApp","description":"Open \\"Settings\\""},',
  '    {"kind":"tap","description":"Tap \\"Search\\""},',
  '    {"kind":"type","description":"Type \\"Fitness\\""},',
  '    {"kind":"tap","description":"Tap the Fitness search result"}',
  '  ]',
  '}',
];

/** Static fallback list used when no registry context is available. */
const STATIC_ALLOWED_KINDS = [
  '- Allowed goal kinds (use the most specific one). These are the ONLY capabilities Athena can execute:',
  '  - "openApp": launch an app by name (description: Open "<AppName>")',
  '  - "tap": tap a UI element (description: Tap "<label>")',
  '  - "type": enter text into a field (description: Type "<text>")',
  '  - "scroll": scroll a view (description: Scroll <direction/area>)',
  '  - "pressHome": press the home button',
  '  - "back": go back',
  '  - "wait": brief wait',
];

/**
 * Build the goal-extraction instructions. When `context` carries the
 * registry's available goal kinds, the prompt is told to choose ONLY from
 * those kinds and is given a capability reference (kind -> what it does),
 * so an on-device model maps the intent onto real capabilities instead of
 * guessing. This is the registry-aware fix that lifted Apple coverage from
 * 3/7 to 7/7 on the canonical scenarios.
 */
export function goalExtractionInstructions(context?: ModelExtractionContext): string {
  const lines = [...BASE_RULES];

  const kinds = context?.availableGoalKinds ?? [];
  if (kinds.length > 0) {
    lines.push(
      '',
      'Allowed goal kinds — these are the ONLY capabilities the active device/registry provides;',
      'you MUST choose from exactly this list and never invent another kind:',
      `  ${kinds.join(', ')}`
    );
    const caps = context?.capabilities ?? [];
    if (caps.length > 0) {
      lines.push('', 'Capability reference (kind -> what it does):');
      for (const cap of caps) {
        lines.push(`  - ${cap.goalKinds.join(' / ')}: ${cap.description}`);
      }
    }
    lines.push(
      '',
      'Prefer the highest-level capability: if a listed kind directly fulfills the whole user intent',
      '(e.g. "searchFlights" for a flight search), emit exactly THAT one goal and do NOT decompose it',
      'into low-level UI steps (tap/type/openApp). Only emit low-level device-interaction goals when',
      'no higher-level kind in the list covers the intent.'
    );
  } else {
    lines.push('', ...STATIC_ALLOWED_KINDS);
  }

  const memory = context?.memory;
  if (memory && memory.length > 0) {
    lines.push(
      '',
      'Memory context — prior facts and preferences remembered from earlier sessions. Honor them',
      'when they apply to this intent instead of asking the user again:'
    );
    for (const entry of memory) {
      lines.push(`  - [${entry.kind}] ${entry.subject}: ${JSON.stringify(entry.payload)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Constrain extracted goals to the kinds the registry can actually satisfy.
 * The on-device model occasionally over-decomposes a high-level intent into
 * low-level UI steps (tap/type) that no capability binds to; keeping only
 * the allowed kinds yields a valid, registry-matching goal set without
 * depending on perfect instruction-following. When `context` is absent the
 * goals pass through unchanged.
 */
export function filterGoalsToContext(
  goals: ReadonlyArray<{ kind: string; description: string }>,
  context?: ModelExtractionContext
): { kind: string; description: string }[] {
  const allowed = context?.availableGoalKinds;
  if (!allowed || allowed.length === 0) {
    return goals.map((g) => ({ kind: g.kind, description: g.description }));
  }
  const set = new Set(allowed.map((k) => k.toLowerCase()));
  return goals
    .filter((g) => set.has(g.kind.toLowerCase()))
    .map((g) => ({ kind: g.kind, description: g.description }));
}

export const SYSTEM_PROMPT = goalExtractionInstructions();

export function parseGoalsJson(
  content: string,
  intent: Intent,
  errorCtor: (message: string) => Error = (message) => new Error(message)
): ModelExtraction {
  let text = content.trim();
  // Strip a fenced block even when it is wrapped in prose (models often
  // prefix "Here is the JSON:" or include trailing commentary).
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(text);
  if (fenced) {
    text = fenced[1].trim();
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // Last resort: extract the first balanced-looking JSON object from the
    // text (handles stray prose around the payload).
    const objMatch = /\{[\s\S]*\}/.exec(text);
    if (objMatch) {
      try {
        data = JSON.parse(objMatch[0]);
      } catch (error) {
        throw errorCtor(`model returned invalid JSON: ${String(error)}`);
      }
    } else {
      throw errorCtor('model returned no JSON object');
    }
  }

  const parsed = GOALS_PAYLOAD_SCHEMA.safeParse(data);
  if (!parsed.success) {
    throw errorCtor(
      `model output failed validation: ${parsed.error.issues.map((issue) => issue.path.join('.') + ' ' + issue.message).join('; ')}`
    );
  }

  const goals: ExtractedGoal[] = parsed.data.goals
    .map((goal) => ({
      kind: goal.kind,
      description: goal.description.length > 0 ? goal.description : (intent.text ?? ''),
    }))
    .filter((goal) => !PROHIBITED_GOAL_KINDS.has(goal.kind.toLowerCase()));

  if (goals.length === 0) {
    return {
      goals: [],
      clarification:
        parsed.data.clarification ??
        'the model returned no executable goals (all were non-actionable verification/observation steps)',
    };
  }

  return { goals };
}
