import type { Action, Goal, Intent, PlanStep } from '@athena-os/core';
import { resolveKnownAppBundleId } from '@athena-os/iphone-agent';

/**
 * The plan -> action bridge (run module).
 *
 * A plan step names a capability; execution needs a concrete device
 * `Action`. This mapper is the pure, hermetic translation: it extracts the
 * parameter payload (app name, element label, text) from the goal the step
 * was built for, and falls back to the step description. Anything it cannot
 * resolve is reported explicitly so a run refuses to execute instead of
 * silently degrading.
 */

export type RunAction =
  | { ok: true; action: Action; label?: string; goalId: string; stepId: string }
  | { ok: false; stepId: string; reason: string };

const QUOTED = /"([^"]+)"/;

function firstQuoted(text: string): string | undefined {
  const match = QUOTED.exec(text);
  return match?.[1];
}

const LEADING_VERBS = new Set([
  'open',
  'launch',
  'start',
  'go',
  'navigate',
  'swipe',
  'scroll',
  'tap',
  'click',
  'press',
  'type',
  'enter',
  'set',
  'toggle',
  'enable',
  'disable',
  'turn',
  'advance',
  'find',
]);

const LEADING_ARTICLES = new Set(['the', 'a', 'an']);

function stripLeadingNoise(text: string): string {
  const parts = text.trim().split(/\s+/);
  while (parts.length > 0) {
    const head = parts[0].toLowerCase();
    const isPhraseVerb = head === 'go' && parts[1]?.toLowerCase() === 'to';
    const isVerb = LEADING_VERBS.has(head) || isPhraseVerb;
    if (isPhraseVerb) {
      parts.splice(0, 2);
      continue;
    }
    if (isVerb) {
      parts.shift();
      continue;
    }
    break;
  }
  while (parts.length > 0 && LEADING_ARTICLES.has(parts[0].toLowerCase())) {
    parts.shift();
  }
  return parts.join(' ');
}

function stripAppSuffix(name: string): string {
  return name.replace(/\b(app|application)s?\b$/i, '').trim();
}

function firstOf(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

function goalForStep(intent: Intent, step: PlanStep): Goal | undefined {
  return intent.goals.find((goal) => goal.id === step.goalId);
}

function fallbackGoal(step: PlanStep): Goal {
  return {
    id: step.goalId,
    kind: step.capabilityId,
    description: step.description,
  };
}

export function mapStepToAction(step: PlanStep, intent: Intent): RunAction {
  const goal = goalForStep(intent, step) ?? fallbackGoal(step);
  const description = step.description;

  const intentText = intent.text ?? '';

  switch (step.capabilityId) {
    case 'launchApp': {
      const candidates = [
        goal.target,
        firstQuoted(goal.description),
        stripLeadingNoise(goal.description),
        firstQuoted(intentText),
        stripLeadingNoise(intentText),
        intentText,
      ];
      let candidate = '';
      let bundleId: string | undefined;
      for (const value of candidates) {
        const trimmed = value?.trim();
        if (!trimmed) continue;
        const resolved =
          resolveKnownAppBundleId(trimmed) ?? resolveKnownAppBundleId(stripAppSuffix(trimmed));
        if (resolved) {
          candidate = trimmed;
          bundleId = resolved;
          break;
        }
      }
      if (!bundleId) {
        return {
          ok: false,
          stepId: step.id,
          reason: `cannot resolve app "${candidate || intentText}" to a bundle identifier (use a known app name or a full bundle id)`,
        };
      }
      return {
        ok: true,
        action: { type: 'launchApp', bundleId, description: `Launch ${candidate}` },
        goalId: step.goalId,
        stepId: step.id,
      };
    }

    case 'tap': {
      const label = firstOf(
        firstQuoted(goal.description),
        firstQuoted(intentText),
        stripLeadingNoise(intentText),
        stripLeadingNoise(goal.description)
      );
      if (!label) {
        return {
          ok: false,
          stepId: step.id,
          reason: 'tap step carries no element label to resolve on screen',
        };
      }
      return {
        ok: true,
        action: { type: 'tap', description: `Tap ${label}` },
        label,
        goalId: step.goalId,
        stepId: step.id,
      };
    }

    case 'type': {
      const text = firstOf(
        firstQuoted(goal.description),
        goal.target,
        firstQuoted(intentText),
        stripLeadingNoise(goal.description),
        stripLeadingNoise(intentText)
      );
      if (!text) {
        return {
          ok: false,
          stepId: step.id,
          reason: 'type step carries no text to enter',
        };
      }
      return {
        ok: true,
        action: { type: 'type', text, description: `Type: ${text}` },
        goalId: step.goalId,
        stepId: step.id,
      };
    }

    case 'pressHome':
      return {
        ok: true,
        action: { type: 'pressHome', description: 'Press home button' },
        goalId: step.goalId,
        stepId: step.id,
      };

    case 'back':
      return {
        ok: true,
        action: { type: 'back', description: 'Go back' },
        goalId: step.goalId,
        stepId: step.id,
      };

    case 'wait':
      return {
        ok: true,
        action: { type: 'wait', duration: 1500, description },
        goalId: step.goalId,
        stepId: step.id,
      };

    case 'screenshot':
      return {
        ok: true,
        action: { type: 'screenshot', description: 'Take screenshot' },
        goalId: step.goalId,
        stepId: step.id,
      };

    default:
      return {
        ok: false,
        stepId: step.id,
        reason: `capability "${step.capabilityId}" is not supported by the run bridge`,
      };
  }
}

export interface PlanActionCollection {
  actions: Array<Extract<RunAction, { ok: true }>>;
  blocked: Array<Extract<RunAction, { ok: false }>>;
}

export function collectRunActions(intent: Intent, steps: PlanStep[]): PlanActionCollection {
  const actions: PlanActionCollection['actions'] = [];
  const blocked: PlanActionCollection['blocked'] = [];
  for (const step of steps) {
    const mapped = mapStepToAction(step, intent);
    if (mapped.ok) {
      actions.push(mapped);
    } else {
      blocked.push(mapped);
    }
  }
  return { actions, blocked };
}
