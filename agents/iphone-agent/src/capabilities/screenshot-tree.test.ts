import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { screenshotCapability } from './screenshot.js';
import { treeCapability } from './tree.js';
import { fakeDriver, fakeContext, runCapability } from '../testing/mock.js';

const VALID_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000f1f8791a0000000a49444154789c6360000002000100e0fb5de00000000049454e44ae426082',
  'hex'
);

describe('Screenshot Capability', () => {
  let dir: string;

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('captures and verifies a screenshot file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'athena-cap-shot-'));
    const driver = fakeDriver({
      async screenshot() {
        return VALID_PNG;
      },
    });
    const { result, verification } = await runCapability(
      screenshotCapability,
      fakeContext({
        driver,
        action: { type: 'screenshot', description: 'Capture' },
        config: { ...fakeContext().config, screenshotDir: dir },
      })
    );

    expect(driver.calls).toContain('screenshot');
    expect(verification.strategy).toBe('file-verified');
    expect(verification.verified).toBe(true);
    expect(result.screenshot).toBe(VALID_PNG.toString('base64'));
    expect(result.metadata?.path).toContain(dir);
  });

  it('fails when the buffer is not a valid PNG', async () => {
    const driver = fakeDriver({
      async screenshot() {
        return Buffer.from('not-a-png');
      },
    });
    await expect(
      runCapability(
        screenshotCapability,
        fakeContext({
          driver,
          action: { type: 'screenshot', description: 'Capture' },
          config: { ...fakeContext().config, screenshotDir: '/tmp/does-not-matter' },
        })
      )
    ).rejects.toThrow(/valid PNG/);
  });
});

describe('Tree Capability', () => {
  it('builds a semantic model and verifies nodes exist', async () => {
    const driver = fakeDriver({
      async getUITree() {
        return {
          type: 'XCUIElementTypeApplication',
          name: 'Settings',
          attributes: { name: 'Settings' },
          children: [
            {
              type: 'XCUIElementTypeButton',
              name: 'Sign In',
              attributes: { name: 'Sign In', enabled: 'true', visible: 'true' },
            },
          ],
        };
      },
    });
    const { result, verification } = await runCapability(
      treeCapability,
      fakeContext({ driver, action: { type: 'getTree', description: 'Get UI tree' } })
    );

    expect(driver.calls).toContain('getUITree');
    expect(verification.strategy).toBe('tree-has-nodes');
    expect(verification.verified).toBe(true);
    expect(verification.details?.elementCount).toBe(2);

    const model = result.metadata?.model as
      { summary?: { elementCount?: number }; score?: number } | undefined;
    expect(model?.summary?.elementCount).toBe(2);
    expect(typeof model?.score).toBe('number');
  });

  it('fails verification on an empty tree', async () => {
    const other = fakeDriver({
      async getUITree() {
        return { type: 'XCUIElementTypeApplication', children: [] };
      },
    });
    const { verification } = await runCapability(
      treeCapability,
      fakeContext({ driver: other, action: { type: 'getTree', description: 'Get UI tree' } })
    );

    expect(verification.strategy).toBe('tree-has-nodes');
    expect(verification.verified).toBe(false);
  });
});
