import { XMLParser } from 'fast-xml-parser';
import type { UITree } from '@athena-os/core';

// Attribute prefix for fast-xml-parser v5. With `attributeNamePrefix` set,
// attributes arrive as `@_name`, distinct from child element keys.
const ATTR_PREFIX = '@_';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  // Merge duplicate tags into arrays so children traversal is uniform.
  isArray: (_name) => true,
  // Keep attribute values as strings; we convert on use.
});

const WRAPPER_KEYS = new Set(['?xml', '#text', '#comment']);

/**
 * Parses WDA page-source XML into a UITree. WDA emits XCUIElementType*
 * elements carrying type/name/label/value/enabled/visible/x/y/width/height
 * attributes. Any other root shape degrades to an empty tree rather than
 * throwing, so the caller can still attempt a screenshot-based fallback.
 */
export function parseAccessibleXML(source: string): UITree {
  const parsed = parser.parse(source);
  const root = findRoot(parsed);
  if (!root) {
    return { type: 'XCUIElementTypeApplication', children: [] };
  }
  return convertNode(root.element, root.tag);
}

interface RootCandidate {
  tag: string;
  element: Record<string, unknown>;
}

function findRoot(parsed: unknown): RootCandidate | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const entries = Object.entries(parsed as Record<string, unknown>);
  for (const [tag, value] of entries) {
    if (!WRAPPER_KEYS.has(tag) && value && typeof value === 'object') {
      const element = Array.isArray(value) ? value[0] : value;
      if (element && typeof element === 'object') {
        const candidate = element as Record<string, unknown>;
        if (looksLikeUiElement(candidate, tag)) {
          return { tag, element: candidate };
        }
        const nested = findRoot(candidate);
        if (nested) return nested;
      }
    }
  }
  return null;
}

function looksLikeUiElement(element: Record<string, unknown>, tag: string): boolean {
  if (tag.startsWith('XCUIElementType')) return true;
  return element[`${ATTR_PREFIX}type`] !== undefined || element[`${ATTR_PREFIX}name`] !== undefined;
}

function convertNode(node: Record<string, unknown>, tag: string): UITree {
  const attributes = extractAttributes(node);
  const type = typeof attributes['type'] === 'string' ? attributes['type'] : tag;

  const children = Object.entries(node)
    .filter(([key]) => !key.startsWith(ATTR_PREFIX) && !key.startsWith('#'))
    .flatMap(([key, value]) => {
      const nodes = Array.isArray(value) ? value : [value];
      return nodes
        .filter((n): n is Record<string, unknown> => typeof n === 'object' && n !== null)
        .map((n) => convertNode(n as Record<string, unknown>, key));
    });

  const uiNode: UITree = {
    type,
    ...(attributes['name'] != null ? { name: String(attributes['name']) } : {}),
    ...(attributes['label'] != null && attributes['label'] !== String(attributes['name'])
      ? { label: String(attributes['label']) }
      : {}),
    ...(attributes['value'] != null ? { value: String(attributes['value']) } : {}),
    ...(extractRect(attributes) ? { rect: extractRect(attributes)! } : {}),
    ...(children.length > 0 ? { children } : {}),
    attributes,
  };

  return uiNode;
}

function extractRect(
  attributes: Record<string, string | number | boolean>
): UITree['rect'] | undefined {
  const x = Number(attributes['x']);
  const y = Number(attributes['y']);
  const width = Number(attributes['width']);
  const height = Number(attributes['height']);
  if ([x, y, width, height].every(Number.isFinite)) {
    return { x, y, width, height };
  }
  const frame = attributes['frame'];
  if (typeof frame === 'string') {
    const [fx, fy, fw, fh] = frame.split(',').map(Number);
    if ([fx, fy, fw, fh].every(Number.isFinite)) return { x: fx, y: fy, width: fw, height: fh };
  }
  return undefined;
}

function extractAttributes(
  node: Record<string, unknown>
): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith(ATTR_PREFIX)) {
      const attrName = key.slice(ATTR_PREFIX.length);
      const first = Array.isArray(value) ? value[0] : value;
      if (first !== undefined) attrs[attrName] = typeof first === 'boolean' ? first : String(first);
    }
  }
  return attrs;
}
