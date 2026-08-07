import type { SemanticElement, SemanticModel, SemanticRole, Selector } from '@athena-os/core';

/** How closely an element's label matched the requested label. */
export type LabelMatchQuality = 'exact' | 'caseInsensitive' | 'contains' | 'none';

export interface ElementMatch {
  /** The matched semantic element. */
  element: SemanticElement;
  /** Ranked confidence in [0,1] combining element confidence and match quality. */
  confidence: number;
  /** How the label matched. */
  match: LabelMatchQuality;
  /** True when the match is strong enough to act on. */
  usable: boolean;
}

export interface ResolveResult {
  matches: ElementMatch[];
  /** Best match (highest confidence) or null when nothing matched. */
  best: ElementMatch | null;
  requestedLabel: string;
}

export interface ResolveOptions {
  /** Only consider elements with this role. */
  role?: SemanticRole;
  /** Only consider enabled elements. */
  enabledOnly?: boolean;
  /** Only consider visible elements. */
  visibleOnly?: boolean;
  /** Minimum confidence for an element to be returned. */
  minConfidence?: number;
}

/** Walk every element depth-first. */
function* walkElement(element: SemanticElement): Generator<SemanticElement> {
  yield element;
  for (const child of element.children) {
    yield* walkElement(child);
  }
}

function matchQuality(label: string, requested: string): LabelMatchQuality {
  if (!label) return 'none';
  if (label === requested) return 'exact';
  if (label.toLowerCase() === requested.toLowerCase()) return 'caseInsensitive';
  if (label.toLowerCase().includes(requested.toLowerCase())) return 'contains';
  return 'none';
}

function labelConfidence(quality: LabelMatchQuality): number {
  switch (quality) {
    case 'exact':
      return 1;
    case 'caseInsensitive':
      return 0.95;
    case 'contains':
      return 0.8;
    case 'none':
      return 0;
  }
}

/**
 * Resolves the semantic elements whose label best matches `requested`, ranked
 * by confidence. This is Milestone 2D's primary "find by label" primitive.
 */
export function resolveElements(model: SemanticModel, requested: string): ElementMatch[] {
  const normalized = requested.trim();

  const matches: ElementMatch[] = [];
  for (const element of walkElement(model.root)) {
    if (!element.label) continue;

    const quality = matchQuality(element.label, normalized);
    if (quality === 'none') continue;

    const confidence = Number(
      Math.min(0.99, element.confidence.value * labelConfidence(quality)).toFixed(3)
    );

    matches.push({
      element,
      confidence,
      match: quality,
      usable: quality !== 'contains' && element.confidence.value >= 0.6,
    });
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}

/**
 * Finds the single best element matching `label`, or null when nothing matches.
 */
export function resolveElement(model: SemanticModel, label: string): SemanticElement | null {
  return resolveElements(model, label)[0]?.element ?? null;
}

/** Returns the resolved set with ranking metadata. */
export function findByLabel(model: SemanticModel, label: string): ResolveResult {
  const matches = resolveElements(model, label);
  return {
    matches,
    best: matches[0] ?? null,
    requestedLabel: label,
  };
}

/**
 * Builds the strongest driver selector we can from an element. Prefers the
 * accessibility identifier, then label, then rect center coordinates, then a
 * type predicate.
 */
export function selectorForElement(element: SemanticElement): Selector {
  const accessibilityValue =
    element.attributes && typeof element.attributes['value'] === 'string'
      ? (element.attributes['value'] as string)
      : undefined;

  if (accessibilityValue) {
    return { type: 'accessibilityId', value: accessibilityValue };
  }
  if (element.label) {
    return { type: 'label', value: element.label };
  }
  if (element.rect) {
    return {
      type: 'coordinates',
      x: Math.round(element.rect.x + element.rect.width / 2),
      y: Math.round(element.rect.y + element.rect.height / 2),
    };
  }
  return { type: 'predicate', value: `type == '${element.type}'` };
}

export interface SelectFromModelResult {
  element: SemanticElement;
  selector: Selector;
  confidence: number;
  quality: LabelMatchQuality;
}

function passesFilters(element: SemanticElement, options: ResolveOptions): boolean {
  if (options.role && element.role !== options.role) return false;
  if (options.enabledOnly && !element.enabled) return false;
  if (options.visibleOnly && !element.visible) return false;
  return true;
}

/**
 * Milestone 2D: select a target element by human-readable label and produce a
 * driver selector plus confidence the planner can act on.
 */
export function selectFromModel(
  model: SemanticModel,
  label: string,
  options: ResolveOptions = {}
): SelectFromModelResult | null {
  const result = findByLabel(model, label);

  let best = result.best;
  if (best && !passesFilters(best.element, options)) best = null;
  if (best && options.minConfidence !== undefined && best.confidence < options.minConfidence) {
    best = null;
  }

  if (!best) return null;

  return {
    element: best.element,
    selector: selectorForElement(best.element),
    confidence: best.confidence,
    quality: best.match,
  };
}
