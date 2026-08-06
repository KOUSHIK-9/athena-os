import { createLogger } from '@athena-os/shared';
import { writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const logger = createLogger('ScreenshotPipeline');

export interface PngInfo {
  width: number;
  height: number;
  format: 'png';
}

export interface ScreenshotMetadata {
  path: string;
  width: number;
  height: number;
  format: 'png';
  device?: string;
  orientation: 'portrait' | 'landscape';
  timestamp: string;
  bytes: number;
}

export interface SavedScreenshot {
  metadata: ScreenshotMetadata;
  verified: boolean;
  verificationDetails: Record<string, unknown>;
}

const PNG_SIGNATURE = 0x89504e47;

/** Validate PNG signature and parse width/height from the IHDR chunk. */
export function parsePng(buffer: Buffer): PngInfo | null {
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== PNG_SIGNATURE) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) return null;
  return { width, height, format: 'png' };
}

export function orientationOf(width: number, height: number): 'portrait' | 'landscape' {
  return width > height ? 'landscape' : 'portrait';
}

export function screenshotFilename(timestamp: Date): string {
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  return `screenshot-${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(
    timestamp.getDate()
  )}-${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(
    timestamp.getSeconds()
  )}-${timestamp.getMilliseconds()}.png`;
}

export function buildScreenshotMetadata(options: {
  buffer: Buffer;
  info: PngInfo;
  device?: string;
  path: string;
  timestamp?: Date;
}): ScreenshotMetadata {
  const timestamp = options.timestamp ?? new Date();
  return {
    path: options.path,
    width: options.info.width,
    height: options.info.height,
    format: 'png',
    device: options.device,
    orientation: orientationOf(options.info.width, options.info.height),
    timestamp: timestamp.toISOString(),
    bytes: options.buffer.length,
  };
}

export function makeScreenshotPath(directory: string, timestamp?: Date): string {
  return join(directory, screenshotFilename(timestamp ?? new Date()));
}

/**
 * Full screenshot pipeline stage: save the buffer to disk, then verify the
 * written file is a valid PNG matching the source buffer.
 */
export async function saveAndVerifyScreenshot(options: {
  buffer: Buffer;
  directory: string;
  path?: string;
  device?: string;
  timestamp?: Date;
}): Promise<SavedScreenshot> {
  const timestamp = options.timestamp ?? new Date();
  const path = options.path ?? makeScreenshotPath(options.directory, timestamp);

  const info = parsePng(options.buffer);
  if (!info) {
    throw new Error('Screenshot buffer is not a valid PNG');
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, options.buffer);

  // Verify: the file exists and parses as the same PNG
  let verified = false;
  const verificationDetails: Record<string, unknown> = { path };
  try {
    const written = await readFile(path);
    const writtenInfo = parsePng(written);
    verificationDetails.writtenBytes = written.length;
    verificationDetails.writtenIsPng = writtenInfo !== null;
    verificationDetails.sourceBytes = options.buffer.length;
    verified =
      writtenInfo !== null &&
      written.length === options.buffer.length &&
      writtenInfo.width === info.width &&
      writtenInfo.height === info.height;
  } catch (error) {
    verificationDetails.error = error instanceof Error ? error.message : String(error);
  }

  const metadata = buildScreenshotMetadata({
    buffer: options.buffer,
    info,
    device: options.device,
    path,
    timestamp,
  });

  if (!verified) {
    logger.warn({ path, ...verificationDetails }, 'Screenshot file verification failed');
  }

  return { metadata, verified, verificationDetails };
}

/** Read a screenshot file back and confirm it is a valid PNG. */
export async function verifyScreenshotFile(path: string): Promise<boolean> {
  try {
    await access(path);
    const buffer = await readFile(path);
    return parsePng(buffer) !== null;
  } catch {
    return false;
  }
}
