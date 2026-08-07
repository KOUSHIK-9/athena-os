import type { SemanticElement, SemanticModel } from '@athena-os/core';

const ICONS: Record<string, string> = {
  button: '[B]',
  image: '[IMG]',
  text: '[T]',
  text_field: '[TF]',
  search_field: '[SRCH]',
  slider: '[SL]',
  switch: '[SW]',
  tab: '[TAB]',
  tab_bar: '[TBAR]',
  navigation_bar: '[NAV]',
  cell: '[CELL]',
  link: '[LINK]',
};

/**
 * Renders a SemanticModel as an indented, human-readable tree suitable for a
 * CLI "inspect" command. Never emits raw XML.
 */
export function renderSemanticTree(model: SemanticModel, maxDepth = 6): string {
  const lines: string[] = [];
  lines.push(elementLine(model.root));
  walk(model.root, [], maxDepth, lines);
  return lines.join('\n');
}

function walk(el: SemanticElement, stack: boolean[], maxDepth: number, lines: string[]): void {
  if (stack.length >= maxDepth) {
    const remaining = countDescendants(el);
    if (remaining > 0) lines.push(`${prefixFor(stack)}└… (${remaining} more)`);
    return;
  }

  const children = el.children;
  for (let i = 0; i < children.length; i++) {
    const last = i === children.length - 1;
    const connector = `${prefixFor(stack)}${last ? '└─ ' : '├─ '}`;
    lines.push(`${connector}${elementLine(children[i])}`);
    walk(children[i], [...stack, last], maxDepth, lines);
  }
}

function prefixFor(stack: boolean[]): string {
  return stack.map((last) => (last ? '   ' : '│  ')).join('');
}

function elementLine(el: SemanticElement): string {
  const label = el.label ? ` "${el.label}"` : '';
  const value = el.value !== undefined && el.value !== '' ? ` = ${el.value}` : '';
  const state = el.enabled ? '' : ' [disabled]';
  const conf = (el.confidence.value * 100).toFixed(0);
  const icon = ICONS[el.role] ?? ' · ';
  return `${icon} ${el.role}${label}${value}${state} (${conf}% ${el.confidence.source})`;
}

function countDescendants(el: SemanticElement): number {
  let count = el.children.length;
  for (const child of el.children) count += countDescendants(child);
  return count;
}
