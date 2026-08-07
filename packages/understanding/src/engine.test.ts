import { describe, it, expect } from 'vitest';
import type { UITree } from '@athena-os/core';
import { buildSemanticModel, countSemanticElements } from './engine.js';
import { renderSemanticTree } from './render.js';

function sampleTree(): UITree {
  return {
    type: 'XCUIElementTypeApplication',
    name: 'Settings',
    children: [
      {
        type: 'XCUIElementTypeNavigationBar',
        name: 'Settings',
        children: [
          { type: 'XCUIElementTypeButton', name: 'Settings' },
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
              { type: 'XCUIElementTypeSwitch', name: 'Wi-Fi' },
            ],
          },
        ],
      },
    ],
  };
}

describe('buildSemanticModel', () => {
  it('maps XCUIElementType to semantic roles', () => {
    const model = buildSemanticModel(sampleTree());
    const nav = model.root.children[0];
    expect(nav.role).toBe('navigation_bar');
    expect(nav.children[0].role).toBe('button');
    expect(model.root.children[1].children[0].children[1].role).toBe('switch');
  });

  it('carries confidence and source on every element', () => {
    const model = buildSemanticModel(sampleTree());
    const button = model.root.children[0].children[0];
    expect(button.confidence.value).toBeGreaterThan(0.8);
    expect(button.confidence.source).toBe('Accessibility');
  });

  it('computes summary counts', () => {
    const model = buildSemanticModel(sampleTree());
    expect(model.summary.elementCount).toBe(8);
    expect(model.summary.interactiveCount).toBe(4);
    expect(model.summary.leafCount).toBe(4);
    expect(model.summary.labelCoverage).toBeCloseTo(6 / 8, 3);
  });

  it('handles an empty root', () => {
    const model = buildSemanticModel({ type: 'XCUIElementTypeApplication' });
    expect(model.summary.elementCount).toBe(1);
    expect(model.summary.interactiveCount).toBe(0);
  });

  it('countSemanticElements matches summary', () => {
    const model = buildSemanticModel(sampleTree());
    expect(countSemanticElements(model.root)).toBe(model.summary.elementCount);
  });
});

describe('renderSemanticTree', () => {
  it('renders a human-readable tree without XML', () => {
    const model = buildSemanticModel(sampleTree());
    const rendered = renderSemanticTree(model);
    expect(rendered).toContain('button "Airplane Mode"');
    expect(rendered).toContain('Accessibility');
    expect(rendered).not.toContain('<XCUIElementType');
  });
});
