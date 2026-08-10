import { describe, it, expect, vi } from 'vitest';
import { AppiumDriver } from './AppiumDriver.js';

type AnyClient = Record<string, ReturnType<typeof vi.fn>>;

function fakeClient(overrides: Partial<AnyClient> = {}): AnyClient {
  const calls: string[] = [];
  const client: AnyClient = {
    execute: vi.fn(async () => ({})),
    findElements: vi.fn(async () => []),
    getElementAttribute: vi.fn(async () => 'true'),
    elementClick: vi.fn(async () => null),
    elementSendKeys: vi.fn(async () => null),
    getPageSource: vi.fn(async () => '<XCUIElementTypeApplication />'),
    ...overrides,
  };
  (client as Record<string, unknown>).__calls = calls;
  return client;
}

function withFakeSession(driver: AppiumDriver, client: AnyClient): void {
  const anyDriver = driver as unknown as { client: AnyClient; sessionId: string };
  anyDriver.client = client;
  anyDriver.sessionId = 'session-1';
}

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

function element(id: string): Record<string, string> {
  return { [ELEMENT_KEY]: id };
}

describe('AppiumDriver.launchApp', () => {
  it('terminates the running app before launching so a fresh state is shown', async () => {
    const client = fakeClient();
    const driver = new AppiumDriver({ host: '127.0.0.1', port: 4723 });
    withFakeSession(driver, client);

    await driver.launchApp('com.apple.Preferences');

    expect(client.execute).toHaveBeenNthCalledWith(1, 'mobile: terminateApp', {
      bundleId: 'com.apple.Preferences',
    });
    expect(client.execute).toHaveBeenNthCalledWith(2, 'mobile: launchApp', {
      bundleId: 'com.apple.Preferences',
    });
  });

  it('keeps launching even when terminate fails (app not running)', async () => {
    const client = fakeClient({
      execute: vi.fn(async (command: string, _opts?: Record<string, unknown>) => {
        if (command === 'mobile: terminateApp') throw new Error('not running');
        return {};
      }),
    });
    const driver = new AppiumDriver({ host: '127.0.0.1', port: 4723 });
    withFakeSession(driver, client);

    await expect(driver.launchApp('com.apple.Preferences')).resolves.toBeUndefined();
    expect(client.execute).toHaveBeenNthCalledWith(2, 'mobile: launchApp', {
      bundleId: 'com.apple.Preferences',
    });
  });
});

describe('AppiumDriver.sourceContains', () => {
  it('returns true when the page source contains the text', async () => {
    const client = fakeClient({
      getPageSource: vi.fn(async () => '<XCUIElementTypeStaticText name="Fitness" />'),
    });
    const driver = new AppiumDriver({ host: '127.0.0.1', port: 4723 });
    withFakeSession(driver, client);

    await expect(driver.sourceContains('Fitness', 50, 20)).resolves.toBe(true);
  });

  it('keeps polling and returns false when the text never appears', async () => {
    const client = fakeClient({
      getPageSource: vi.fn(async () => '<XCUIElementTypeStaticText name="Nothing" />'),
    });
    const driver = new AppiumDriver({ host: '127.0.0.1', port: 4723 });
    withFakeSession(driver, client);

    await expect(driver.sourceContains('Fitness', 60, 20)).resolves.toBe(false);
    expect(client.getPageSource.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('AppiumDriver.type fallback for search', () => {
  it('activates a Search button before typing when no input field exists yet', async () => {
    const searchField = element('field-ref');
    const searchButton = element('btn-ref');

    const findElements = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([searchButton])
      .mockResolvedValueOnce([searchField]);

    const elementClick = vi.fn(async () => null);
    const client = fakeClient({ findElements, elementClick });
    const driver = new AppiumDriver({ host: '127.0.0.1', port: 4723 });
    withFakeSession(driver, client);

    await driver.type('Fitness');

    expect(findElements).toHaveBeenNthCalledWith(
      1,
      'xpath',
      '//*[@type="XCUIElementTypeSearchField"]'
    );
    expect(findElements).toHaveBeenNthCalledWith(
      2,
      'xpath',
      '//*[@type="XCUIElementTypeTextField"]'
    );
    expect(findElements).toHaveBeenNthCalledWith(
      3,
      'xpath',
      '//*[@type="XCUIElementTypeButton"][@name="Search" or @label="Search"]'
    );
    expect(elementClick).toHaveBeenNthCalledWith(1, 'btn-ref');
    expect(client.elementSendKeys).toHaveBeenCalledWith('field-ref', 'Fitness');
  });

  it('types directly into an existing search field without activating a button', async () => {
    const searchField = element('field-ref');
    const findElements = vi.fn().mockResolvedValue([searchField]);
    const client = fakeClient({ findElements });
    const driver = new AppiumDriver({ host: '127.0.0.1', port: 4723 });
    withFakeSession(driver, client);

    await driver.type('Fitness');

    expect(findElements).toHaveBeenCalledOnce();
    expect(client.elementClick).toHaveBeenCalledWith('field-ref');
    expect(client.elementSendKeys).toHaveBeenCalledWith('field-ref', 'Fitness');
  });
});
