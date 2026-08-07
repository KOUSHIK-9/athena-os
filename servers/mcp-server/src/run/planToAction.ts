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
  { ok: true; action: Action; label?: string } | { ok: false; stepId: string; reason: string };

const QUOTED = /['"]([^'"]+)['"]/;

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

function elementLabelFor(goal: Goal): string | undefined {
  const quoted = firstQuoted(goal.description);
  if (quoted) return quoted;
  const cleaned = stripLeadingNoise(goal.description);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function mapStepToAction(step: PlanStep, intent: Intent): RunAction {
  const goal = goalForStep(intent, step) ?? fallbackGoal(step);
  const description = step.description;

  switch (step.capabilityId) {
    case 'launchApp': {
      const candidate = (goal.target ?? stripLeadingNoise(goal.description)).trim();
      const bundleId =
        resolveKnownAppBundleId(candidate) ?? resolveKnownAppBundleId(stripAppSuffix(candidate));
      if (!bundleId) {
        return {
          ok: false,
          stepId: step.id,
          reason: `cannot resolve app "${candidate}" to a bundle identifier (use a known app name or a full bundle id)`,
        };
      }
      return {
        ok: true,
        action: { type: 'launchApp', bundleId, description: `Launch ${candidate}` },
      };
    }

    case 'tap': {
      const label = elementLabelFor(goal);
      if (!label) {
        return {
          ok: false,
          stepId: step.id,
          reason: 'tap step carries no element label to resolve on screen',
        };
      }
      return { ok: true, action: { type: 'tap', description: `Tap ${label}` }, label };
    }

    case 'type': {
      const quoted = firstQuoted(goal.description);
      const text = quoted ?? goal.target ?? stripLeadingNoise(goal.description);
      if (!text) {
        return {
          ok: false,
          stepId: step.id,
          reason: 'type step carries no text to enter',
        };
      }
      return { ok: true, action: { type: 'type', text, description: `Type: ${text}` } };
    }

    case 'pressHome':
      return { ok: true, action: { type: 'pressHome', description: 'Press home button' } };

    case 'back':
      return { ok: true, action: { type: 'back', description: 'Go back' } };

    case 'wait':
      return { ok: true, action: { type: 'wait', duration: 1500, description } };

    case 'screenshot':
      return { ok: true, action: { type: 'screenshot', description: 'Take screenshot' } };

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
