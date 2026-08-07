import { describe, it, expect } from 'vitest';
import { parseAccessibleXML } from './xml.js';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<AppiumAUT>
<XCUIElementTypeApplication type="XCUIElementTypeApplication" name="Settings" label="Settings" enabled="true" visible="true" x="0" y="0" width="390" height="844">
  <XCUIElementTypeNavigationBar type="XCUIElementTypeNavigationBar" name="Settings" enabled="true" visible="true" x="0" y="47" width="390" height="44">
    <XCUIElementTypeButton type="XCUIElementTypeButton" name="Back" enabled="true" visible="true" x="0" y="47" width="60" height="44"/>
    <XCUIElementTypeButton type="XCUIElementTypeButton" name="Add" enabled="false" visible="true" x="330" y="47" width="60" height="44"/>
  </XCUIElementTypeNavigationBar>
  <XCUIElementTypeScrollView type="XCUIElementTypeScrollView" enabled="true" visible="true" x="0" y="91" width="390" height="753">
    <XCUIElementTypeSwitch type="XCUIElementTypeSwitch" name="Wi-Fi" value="0" enabled="true" visible="true" x="320" y="120" width="51" height="31"/>
  </XCUIElementTypeScrollView>
</XCUIElementTypeApplication>
</AppiumAUT>`;

describe('parseAccessibleXML', () => {
  it('parses the application root with attributes', () => {
    const tree = parseAccessibleXML(SAMPLE);
    expect(tree.type).toBe('XCUIElementTypeApplication');
    expect(tree.name).toBe('Settings');
    expect(tree.rect).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  });

  it('preserves child hierarchy', () => {
    const tree = parseAccessibleXML(SAMPLE);
    expect(tree.children).toHaveLength(2);
    const nav = tree.children[0];
    expect(nav.type).toBe('XCUIElementTypeNavigationBar');
    expect(nav.children).toHaveLength(2);
  });

  it('captures enabled/visible attributes for semantic trust', () => {
    const tree = parseAccessibleXML(SAMPLE);
    const buttons = tree.children[0].children!;
    expect(buttons[1].attributes?.['enabled']).toBe('false');
    expect(tree.children[1].children?.[0].attributes?.['visible']).toBe('true');
  });

  it('captures value attribute', () => {
    const tree = parseAccessibleXML(SAMPLE);
    const wifi = tree.children[1].children![0];
    expect(wifi.value).toBe('0');
  });

  it('degrades to an empty tree on malformed input', () => {
    const tree = parseAccessibleXML('not-valid-xml-at-all');
    expect(tree.type).toBe('XCUIElementTypeApplication');
    expect(tree.children).toEqual([]);
  });
});
