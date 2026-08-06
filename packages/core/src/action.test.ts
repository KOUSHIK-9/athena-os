import { describe, it, expect } from 'vitest';
import {
  ActionSchema,
  createLaunchAppAction,
  createTapAction,
  createTypeAction,
  createScreenshotAction,
  createGetTreeAction,
  createPressHomeAction,
  createTerminateAppAction,
  createSwipeAction,
  createWaitAction,
  createBackAction,
} from './action.js';
import { SelectorSchema } from './selector.js';

describe('Action factory functions', () => {
  it('createLaunchAppAction produces a valid launchApp action', () => {
    const action = createLaunchAppAction('com.apple.mobilesafari');
    expect(ActionSchema.safeParse(action).success).toBe(true);
    expect(action.type).toBe('launchApp');
    expect(action.bundleId).toBe('com.apple.mobilesafari');
    expect(action.description).toBe('Launch app com.apple.mobilesafari');
  });

  it('createTapAction supports a selector and defaults description', () => {
    const action = createTapAction({ type: 'accessibilityId', value: 'btn-ok' });
    expect(ActionSchema.safeParse(action).success).toBe(true);
    expect(action.type).toBe('tap');
    expect(action.selector).toEqual({ type: 'accessibilityId', value: 'btn-ok' });
  });

  it('createTypeAction carries text and selector', () => {
    const action = createTypeAction('hello', { type: 'label', value: 'Search' });
    expect(ActionSchema.safeParse(action).success).toBe(true);
    expect(action.text).toBe('hello');
    expect(action.selector).toEqual({ type: 'label', value: 'Search' });
  });

  it('createSwipeAction supports all directions and defaults distance', () => {
    const action = createSwipeAction('left');
    expect(ActionSchema.safeParse(action).success).toBe(true);
    expect(action.direction).toBe('left');
    expect(action.distance).toBeUndefined();
  });

  it('createWaitAction stores duration', () => {
    const action = createWaitAction(500);
    expect(ActionSchema.safeParse(action).success).toBe(true);
    expect(action.duration).toBe(500);
  });

  it('all action types validate against ActionSchema', () => {
    const actions = [
      createLaunchAppAction('a'),
      createTapAction(),
      createTypeAction('text'),
      createScreenshotAction(),
      createGetTreeAction(),
      createPressHomeAction(),
      createTerminateAppAction('b'),
      createSwipeAction('up'),
      createWaitAction(100),
      createBackAction(),
    ];
    for (const action of actions) {
      expect(ActionSchema.safeParse(action).success).toBe(true);
    }
  });

  it('rejects an action with an unknown type', () => {
    const result = ActionSchema.safeParse({ type: 'unknown', description: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('SelectorSchema', () => {
  it('validates each selector strategy', () => {
    const valid: unknown[] = [
      { type: 'accessibilityId', value: 'abc' },
      { type: 'label', value: 'abc' },
      { type: 'predicate', value: 'name == "abc"' },
      { type: 'xpath', value: '//*[@name="abc"]' },
      { type: 'coordinates', x: 10, y: 20 },
    ];
    for (const selector of valid) {
      expect(SelectorSchema.safeParse(selector).success).toBe(true);
    }
  });

  it('rejects invalid selectors', () => {
    expect(SelectorSchema.safeParse({ type: 'coordinates', x: 10 }).success).toBe(false);
    expect(SelectorSchema.safeParse({ type: 'unknown', value: 'x' }).success).toBe(false);
  });
});
