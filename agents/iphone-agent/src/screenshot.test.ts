import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parsePng,
  orientationOf,
  screenshotFilename,
  buildScreenshotMetadata,
  saveAndVerifyScreenshot,
  verifyScreenshotFile,
} from './screenshot.js';

/** Tiny valid 1x1 PNG (signature + IHDR 1x1). */
const VALID_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000f1f8791a0000000a49444154789c6360000002000100e0fb5de00000000049454e44ae426082',
  'hex'
);

describe('parsePng', () => {
  it('parses width/height from a valid PNG', () => {
    const info = parsePng(VALID_PNG);
    expect(info).toEqual({ width: 1, height: 1, format: 'png' });
  });

  it('rejects buffers that are too short', () => {
    expect(parsePng(Buffer.from([1, 2, 3]))).toBeNull();
  });

  it('rejects non-PNG signatures', () => {
    const notPng = Buffer.alloc(64, 0xff);
    expect(parsePng(notPng)).toBeNull();
  });

  it('rejects zero dimensions', () => {
    const zero = Buffer.from(VALID_PNG);
    zero.writeUInt32BE(0, 16);
    expect(parsePng(zero)).toBeNull();
  });
});

describe('orientationOf', () => {
  it('detects landscape when wider than tall', () => {
    expect(orientationOf(2000, 1000)).toBe('landscape');
  });

  it('detects portrait when taller than wide', () => {
    expect(orientationOf(1000, 2000)).toBe('portrait');
  });
});

describe('screenshotFilename', () => {
  it('produces a timestamped png filename', () => {
    const name = screenshotFilename(new Date(2026, 7, 7, 9, 4, 5, 6));
    expect(name).toMatch(/^screenshot-20260807-090405-6\.png$/);
  });
});

describe('buildScreenshotMetadata', () => {
  it('builds full metadata from the buffer and info', () => {
    const info = parsePng(VALID_PNG)!;
    const ts = new Date(2026, 7, 7, 9, 4, 5, 0);
    const meta = buildScreenshotMetadata({
      buffer: VALID_PNG,
      info,
      device: 'iphone17,1',
      path: '/tmp/latest.png',
      timestamp: ts,
    });

    expect(meta).toMatchObject({
      path: '/tmp/latest.png',
      width: 1,
      height: 1,
      format: 'png',
      device: 'iphone17,1',
      orientation: 'portrait',
      timestamp: ts.toISOString(),
    });
  });
});

describe('saveAndVerifyScreenshot', () => {
  let dir: string;

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('saves and verifies a valid PNG round-trip', async () => {
    dir = await mkdtemp(join(tmpdir(), 'athena-shot-'));
    const saved = await saveAndVerifyScreenshot({ buffer: VALID_PNG, directory: dir });

    expect(saved.verified).toBe(true);
    expect(saved.metadata.width).toBe(1);
    expect(saved.metadata.height).toBe(1);
    expect(saved.metadata.format).toBe('png');
    expect(saved.metadata.path).toContain(dir);

    const onDisk = await readFile(saved.metadata.path);
    expect(onDisk.equals(VALID_PNG)).toBe(true);
  });

  it('honors an explicit path', async () => {
    const target = join(dir, 'override.png');
    const saved = await saveAndVerifyScreenshot({
      buffer: VALID_PNG,
      directory: dir,
      path: target,
    });
    expect(saved.metadata.path).toBe(target);
  });
});

describe('verifyScreenshotFile', () => {
  it('returns false for a missing file', async () => {
    expect(await verifyScreenshotFile('/nonexistent/athena/missing.png')).toBe(false);
  });
});
