import { createVerificationResult } from '@athena-os/core';
import { createLogger } from '@athena-os/shared';
import { createCapability } from './helpers.js';
import { saveAndVerifyScreenshot } from '../screenshot.js';
import type { CapabilityResultPayload, CapabilityRunContext } from './types.js';

const logger = createLogger('ScreenshotCapability');

async function execute(context: CapabilityRunContext) {
  if (context.action.type !== 'screenshot') return {};

  const screenshotBuffer = await context.driver.screenshot();
  const directory = context.config?.screenshotDir ?? 'screenshots';
  const saved = await saveAndVerifyScreenshot({
    buffer: screenshotBuffer,
    directory,
    device: context.session?.deviceUdid,
  });

  if (!saved.verified) {
    logger.warn(
      { path: saved.metadata.path, ...saved.verificationDetails },
      'Screenshot file verification failed'
    );
  }

  return {
    screenshot: screenshotBuffer.toString('base64'),
    metadata: {
      ...saved.metadata,
      verified: saved.verified,
    } as unknown as Record<string, unknown>,
  };
}

async function verify(context: CapabilityRunContext, result: CapabilityResultPayload) {
  const meta = result.metadata as {
    verified?: boolean;
    width?: number;
    height?: number;
    path?: string;
  };
  const verified = Boolean(meta?.verified && meta.width && meta.height);
  return createVerificationResult('file-verified', verified, {
    path: meta?.path,
    width: meta?.width,
    height: meta?.height,
  });
}

export const screenshotCapability = createCapability({
  id: 'Screenshot',
  kinds: ['screenshot'],
  validate: () => undefined,
  execute,
  verify,
});
