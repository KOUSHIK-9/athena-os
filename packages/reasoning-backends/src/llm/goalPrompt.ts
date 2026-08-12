import type { Intent } from '@athena-os/core';
import { z } from 'zod';
import type { ExtractedGoal, ModelExtraction } from './modelClient.js';

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

export const SYSTEM_PROMPT = [
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
  '- Allowed goal kinds (use the most specific one). These are the ONLY capabilities Athena can execute:',
  '  - "openApp": launch an app by name (description: Open "<AppName>")',
  '  - "tap": tap a UI element (description: Tap "<label>")',
  '  - "type": enter text into a field (description: Type "<text>")',
  '  - "scroll": scroll a view (description: Scroll <direction/area>)',
  '  - "pressHome": press the home button',
  '  - "back": go back',
  '  - "wait": brief wait',
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
].join('\n');

export function parseGoalsJson(
  content: string,
  intent: Intent,
  errorCtor: (message: string) => Error = (message) => new Error(message)
): ModelExtraction {
  let text = content.trim();
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  if (fenced) {
    text = fenced[1].trim();
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw errorCtor(`model returned invalid JSON: ${String(error)}`);
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
