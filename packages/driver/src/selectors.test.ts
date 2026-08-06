import { describe, it, expect } from 'vitest';
import {
  resolveSelector,
  getSelectorPriority,
  sortSelectors,
  createFallbackSelectors,
} from './selectors.js';
import type { Selector } from '@athena-os/executor';

describe('resolveSelector', () => {
  it('maps each strategy to the correct appium strategy', () => {
    expect(resolveSelector({ type: 'accessibilityId', value: 'a' })).toEqual({
      strategy: 'accessibility id',
      value: 'a',
    });
    expect(resolveSelector({ type: 'label', value: 'a' })).toEqual({
      strategy: 'accessibility id',
      value: 'a',
    });
    expect(resolveSelector({ type: 'predicate', value: 'name == "a"' })).toEqual({
      strategy: '-ios predicate string',
      value: 'name == "a"',
    });
    expect(resolveSelector({ type: 'xpath', value: '//*[@name="a"]' })).toEqual({
      strategy: 'xpath',
      value: '//*[@name="a"]',
    });
    expect(resolveSelector({ type: 'coordinates', x: 1, y: 2 })).toEqual({
      strategy: 'coordinates',
      value: '1,2',
    });
  });
});

describe('getSelectorPriority', () => {
  it('orders strategies accessibilty > label > predicate > xpath > coordinates', () => {
    expect(getSelectorPriority({ type: 'accessibilityId', value: 'a' })).toBe(1);
    expect(getSelectorPriority({ type: 'label', value: 'a' })).toBe(2);
    expect(getSelectorPriority({ type: 'predicate', value: 'a' })).toBe(3);
    expect(getSelectorPriority({ type: 'xpath', value: 'a' })).toBe(4);
    expect(getSelectorPriority({ type: 'coordinates', x: 1, y: 2 })).toBe(5);
  });
});

describe('sortSelectors', () => {
  it('sorts by priority without mutating input', () => {
    const selectors: Selector[] = [
      { type: 'coordinates', x: 1, y: 2 },
      { type: 'accessibilityId', value: 'a' },
      { type: 'xpath', value: '//x' },
    ];
    const sorted = sortSelectors(selectors);
    expect(sorted.map(getSelectorPriority)).toEqual([1, 4, 5]);
    expect(selectors.map(getSelectorPriority)).toEqual([5, 1, 4]);
  });
});

describe('createFallbackSelectors', () => {
  it('builds a fallback chain for accessibility id', () => {
    const fallbacks = createFallbackSelectors({ type: 'accessibilityId', value: 'btn' });
    expect(fallbacks.length).toBe(4);
    expect(fallbacks[0]).toEqual({ type: 'accessibilityId', value: 'btn' });
    expect(fallbacks[1]).toEqual({ type: 'label', value: 'btn' });
    expect(fallbacks[2]).toEqual({ type: 'predicate', value: 'name == "btn"' });
    expect(fallbacks[3]).toEqual({ type: 'xpath', value: '//*[@name="btn"]' });
  });

  it('builds a fallback for label', () => {
    const fallbacks = createFallbackSelectors({ type: 'label', value: 'btn' });
    expect(fallbacks[1]).toEqual({ type: 'accessibilityId', value: 'btn' });
    expect(fallbacks[2]).toEqual({ type: 'predicate', value: 'label == "btn"' });
    expect(fallbacks[3]).toEqual({ type: 'xpath', value: '//*[@label="btn"]' });
  });

  it('only returns primary for non-text selectors', () => {
    const predicateFallbacks = createFallbackSelectors({ type: 'predicate', value: 'a == 1' });
    expect(predicateFallbacks).toEqual([{ type: 'predicate', value: 'a == 1' }]);
    const coordFallbacks = createFallbackSelectors({ type: 'coordinates', x: 1, y: 2 });
    expect(coordFallbacks.length).toBe(1);
  });
});
