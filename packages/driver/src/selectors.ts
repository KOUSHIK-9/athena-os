import type { Selector } from '@athena-os/executor';

export interface ResolvedSelector {
  strategy: 'accessibility id' | 'xpath' | 'class name' | '-ios predicate string' | 'coordinates';
  value: string;
}

export function resolveSelector(selector: Selector): ResolvedSelector {
  switch (selector.type) {
    case 'accessibilityId':
      return { strategy: 'accessibility id', value: selector.value };
    case 'label':
      return { strategy: 'accessibility id', value: selector.value };
    case 'predicate':
      return { strategy: '-ios predicate string', value: selector.value };
    case 'xpath':
      return { strategy: 'xpath', value: selector.value };
    case 'coordinates':
      return { strategy: 'coordinates', value: `${selector.x},${selector.y}` };
  }
}

export function getSelectorPriority(selector: Selector): number {
  switch (selector.type) {
    case 'accessibilityId':
      return 1;
    case 'label':
      return 2;
    case 'predicate':
      return 3;
    case 'xpath':
      return 4;
    case 'coordinates':
      return 5;
  }
}

export function sortSelectors(selectors: Selector[]): Selector[] {
  return [...selectors].sort((a, b) => getSelectorPriority(a) - getSelectorPriority(b));
}

export function createFallbackSelectors(primary: Selector): Selector[] {
  const fallbacks: Selector[] = [primary];

  if (primary.type === 'accessibilityId') {
    fallbacks.push({ type: 'label', value: primary.value });
    fallbacks.push({ type: 'predicate', value: `name == "${primary.value}"` });
    fallbacks.push({ type: 'xpath', value: `//*[@name="${primary.value}"]` });
  } else if (primary.type === 'label') {
    fallbacks.push({ type: 'accessibilityId', value: primary.value });
    fallbacks.push({ type: 'predicate', value: `label == "${primary.value}"` });
    fallbacks.push({ type: 'xpath', value: `//*[@label="${primary.value}"]` });
  }

  return fallbacks;
}
