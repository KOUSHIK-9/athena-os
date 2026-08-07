import { describe, it, expect } from 'vitest';
import type { UITree } from '@athena-os/core';
import { buildSemanticModel } from './engine.js';
import {
  findByLabel,
  resolveElement,
  resolveElements,
  selectFromModel,
  selectorForElement,
} from './resolver.js';

function sampleTree(): UITree {
  return {
    type: 'XCUIElementTypeApplication',
    name: 'Settings',
    attributes: { name: 'Settings' },
    children: [
      {
        type: 'XCUIElementTypeNavigationBar',
        name: 'Settings',
        children: [
          {
            type: 'XCUIElementTypeButton',
            name: 'Settings',
            attributes: { name: 'Settings', value: 'settings.btn' },
          },
          { type: 'XCUIElementTypeButton', name: 'Add' },
        ],
      },
      {
        type: 'XCUIElementTypeScrollView',
        children: [
          {
            type: 'XCUIElementTypeOther',
            children: [
              { type: 'XCUIElementTypeButton', name: 'Airplane Mode' },
              {
                type: 'XCUIElementTypeSwitch',
                name: 'Wi-Fi',
                attributes: { name: 'Wi-Fi', enabled: 'true' },
              },
            ],
          },
        ],
      },
    ],
  };
}

function model(): ReturnType<typeof buildSemanticModel> {
  return buildSemanticModel(sampleTree());
}

describe('resolveElements', () => {
  it('ranks exact matches first', () => {
    const matches = resolveElements(model(), 'Settings');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].match).toBe('exact');
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('matches case-insensitively', () => {
    const matches = resolveElements(model(), 'add');
    expect(matches[0].element.label).toBe('Add');
    expect(matches[0].match).toBe('caseInsensitive');
  });

  it('finds no anchors with no matches', () => {
    const matches = resolveElements(model(), 'No Such Label');
    expect(matches).toEqual([]);
  });
});

describe('resolveElement / findByLabel', () => {
  it('returns the best element by label', () => {
    const element = resolveElement(model(), 'Airplane Mode');
    expect(element?.label).toBe('Airplane Mode');
    expect(element?.role).toBe('button');
  });

  it('returns null when nothing matches', () => {
    expect(resolveElement(model(), 'missing')).toBeNull();
  });

  it('findByLabel exposes matches and best', () => {
    const result = findByLabel(model(), 'Wi-Fi');
    expect(result.best?.element.role).toBe('switch');
    expect(result.matches[0]).toBe(result.best);
    expect(result.requestedLabel).toBe('Wi-Fi');
  });

  it('marks weak matches as unusable', () => {
    const result = findByLabel(model(), 'fi');
    const weak = result.matches.filter((m) => m.match === 'contains');
    expect(weak.length).toBeGreaterThan(0);
    expect(weak.every((m) => !m.usable)).toBe(true);
  });
});

describe('selectorForElement', () => {
  it('prefers accessibility id', () => {
    const tree: UITree = {
      type: 'XCUIElementTypeApplication',
      name: 'Settings',
      children: [
        {
          type: 'XCUIElementTypeButton',
          name: 'Save',
          attributes: { name: 'Save', value: 'settings.save-btn' },
        },
      ],
    };
    const el = buildSemanticModel(tree).root.children[0];
    expect(selectorForElement(el)).toEqual({ type: 'accessibilityId', value: 'settings.save-btn' });
  });

  it('falls back to coordinates from the rect center', () => {
    const tree: UITree = {
      type: 'XCUIElementTypeApplication',
      children: [
        {
          type: 'XCUIElementTypeButton',
          attributes: { x: '10', y: '20', width: '100', height: '40' },
        },
      ],
    };
    const unlabeled = buildSemanticModel(tree).root.children[0];
    expect(selectorForElement(unlabeled)).toEqual({ type: 'coordinates', x: 60, y: 40 });
  });
});

describe('selectFromModel', () => {
  it('returns selector, confidence, and quality for a label', () => {
    const selected = selectFromModel(model(), 'Wi-Fi');
    expect(selected?.element.role).toBe('switch');
    expect(selected?.quality).toBe('exact');
    expect(typeof selected?.confidence).toBe('number');
    expect(selected?.selector.type).toBe('label');
  });

  it('filters by role', () => {
    const selected = selectFromModel(model(), 'Settings', { role: 'switch' });
    expect(selected).toBeNull();
  });

  it('filters by minConfidence', () => {
    const selected = selectFromModel(model(), 'Wi-Fi', { minConfidence: 0.995 });
    expect(selected).toBeNull();
  });

  it('rejects when nothing matches', () => {
    expect(selectFromModel(model(), 'ghost')).toBeNull();
  });
});
