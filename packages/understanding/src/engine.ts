import type {
  SemanticElement,
  SemanticModel,
  SemanticRect,
  SemanticRole,
  SemanticSummary,
  SemanticSource,
  UITree,
} from '@athena-os/core';

const HUGE_UI_ELEMENTS = 25_000;

const ROLE_BY_TYPE: Record<string, SemanticRole> = {
  XCUIElementTypeButton: 'button',
  XCUIElementTypeImage: 'image',
  XCUIElementTypeStaticText: 'text',
  XCUIElementTypeTextField: 'text_field',
  XCUIElementTypeSearchField: 'search_field',
  XCUIElementTypeSlider: 'slider',
  XCUIElementTypeSwitch: 'switch',
  XCUIElementTypeTab: 'tab',
  XCUIElementTypeTabBar: 'tab_bar',
  XCUIElementTypeNavigationBar: 'navigation_bar',
  XCUIElementTypeOther: 'other',
  XCUIElementTypeCell: 'cell',
  XCUIElementTypeTable: 'table',
  XCUIElementTypeScrollView: 'scroll_view',
  XCUIElementTypeAlert: 'alert',
  XCUIElementTypeLink: 'link',
  XCUIElementTypePageIndicator: 'page_indicator',
};

const INTERACTIVE_ROLES = new Set<SemanticRole>([
  'button',
  'link',
  'slider',
  'switch',
  'tab',
  'text_field',
  'search_field',
  'cell',
]);

function roleFor(type: string): SemanticRole {
  return ROLE_BY_TYPE[type] ?? 'other';
}

function parseAttr(
  source: Record<string, string | number | boolean> | undefined,
  key: string
): string | undefined {
  if (!source) return undefined;
  const raw = source[key];
  return raw === undefined || raw === null ? undefined : String(raw);
}

function parseBool(raw: string | number | boolean | undefined, fallback: boolean): boolean {
  if (typeof raw === 'string') return raw === 'true' || raw === '1';
  if (typeof raw === 'boolean') return raw;
  return fallback;
}

function rectFrom(
  source: Record<string, string | number | boolean> | undefined
): SemanticRect | undefined {
  if (!source) return undefined;
  const x = Number(source['x']);
  const y = Number(source['y']);
  const width = Number(source['width']);
  const height = Number(source['height']);
  if (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height)
  ) {
    return { x, y, width, height };
  }
  return undefined;
}

function confidenceOf(
  type: string,
  label: string,
  enabled: boolean,
  hasRect: boolean
): { value: number; source: SemanticSource } {
  let base = 0.5;
  if (label) base += 0.35;
  if (type && type !== 'XCUIElementTypeOther') base += 0.1;
  if (hasRect) base += 0.05;
  if (enabled) base += 0.05;
  return { value: Number(Math.min(0.99, base).toFixed(2)), source: 'Accessibility' };
}

/**
 * Transforms a raw driver UITree into a semantic UI model with roles and
 * confidence. The planner never sees the raw tree — only this model.
 */
export function buildSemanticModel(root: UITree): SemanticModel {
  const convertedRoot = convertElement(root, '0');
  const summary = summarize(convertedRoot);
  const score = scoredConfidence(summary);
  return {
    score,
    capturedAt: new Date().toISOString(),
    root: convertedRoot,
    summary,
  };
}

function convertElement(node: UITree, id: string): SemanticElement {
  const attributed = node.attributes;
  const label = parseAttr(attributed, 'name') ?? node.name ?? node.label ?? '';
  const rect = rectFrom(attributed);
  const enabled = parseBool(attributed?.['enabled'], true);
  const visible = parseBool(attributed?.['visible'], true);

  const children = (node.children ?? []).map((child, idx) => convertElement(child, `${id}.${idx}`));

  return {
    id,
    role: roleFor(node.type),
    type: node.type,
    label,
    value: node.value ?? parseAttr(attributed, 'value'),
    rect: rect ?? node.rect,
    enabled,
    visible,
    confidence: confidenceOf(node.type, label, enabled, rect !== undefined),
    children,
    attributes: {
      ...(node.attributes ?? {}),
      ...(node.name !== undefined ? { name: node.name } : {}),
      ...(node.value !== undefined ? { value: node.value } : {}),
    },
  };
}

function summarize(root: SemanticElement): SemanticSummary {
  const counts: Record<
    'elementCount' | 'leafCount' | 'interactiveCount' | 'visibleCount' | 'labeledCount',
    number
  > & { confidenceTotal: number; maxDepth: number; maxWidth: number } = {
    elementCount: 0,
    leafCount: 0,
    interactiveCount: 0,
    visibleCount: 0,
    labeledCount: 0,
    confidenceTotal: 0,
    maxDepth: 0,
    maxWidth: 0,
  };

  const walk = (el: SemanticElement, depth: number): void => {
    counts.elementCount++;
    counts.confidenceTotal += el.confidence.value;
    counts.maxDepth = Math.max(counts.maxDepth, depth);
    counts.maxWidth = Math.max(counts.maxWidth, el.children.length);

    if (el.visible) counts.visibleCount++;
    if (el.label) counts.labeledCount++;
    if (el.children.length === 0) counts.leafCount++;
    if (INTERACTIVE_ROLES.has(el.role) && el.enabled) counts.interactiveCount++;

    for (const child of el.children) walk(child, depth + 1);
  };

  walk(root, 0);

  return {
    elementCount: counts.elementCount,
    leafCount: counts.leafCount,
    interactiveCount: counts.interactiveCount,
    visibleCount: counts.visibleCount,
    labeledCount: counts.labeledCount,
    averageConfidence: counts.elementCount
      ? Number((counts.confidenceTotal / counts.elementCount).toFixed(3))
      : 0,
    labelCoverage: counts.elementCount
      ? Number((counts.labeledCount / counts.elementCount).toFixed(3))
      : 0,
  };
}

function scoredConfidence(summary: SemanticSummary): number {
  let score = 0;
  score += Math.min(1, summary.elementCount / 10) * 0.2;
  score += Math.min(1, summary.labelCoverage) * 0.5;
  score += summary.averageConfidence * 0.3;
  const sizePenalty = summary.elementCount > HUGE_UI_ELEMENTS ? 0.2 : 0;
  return Number(Math.max(0, Math.min(1, score - sizePenalty)).toFixed(3));
}

export function countSemanticElements(root: SemanticElement): number {
  let count = 1;
  for (const child of root.children) count += countSemanticElements(child);
  return count;
}
