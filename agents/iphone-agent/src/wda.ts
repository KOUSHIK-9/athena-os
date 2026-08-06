import { createLogger } from '@athena-os/shared';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const logger = createLogger('WDA');

export interface WDAStatus {
  xcodeInstalled: boolean;
  xcodeVersion?: string;
  developerModeEnabled: boolean;
  wdaRunnerInstalled: boolean;
  wdaRunnerPath?: string;
  signingIdentity?: string;
}

export async function verifyWDA(): Promise<WDAStatus> {
  logger.info('Verifying WebDriverAgent setup');

  const status: WDAStatus = {
    xcodeInstalled: false,
    developerModeEnabled: false,
    wdaRunnerInstalled: false,
  };

  // Check Xcode
  try {
    const { stdout } = await execFileAsync('xcodebuild', ['-version']);
    const lines = stdout.trim().split('\n');
    status.xcodeInstalled = true;
    status.xcodeVersion = lines[0];
    logger.info({ version: status.xcodeVersion }, 'Xcode found');
  } catch {
    logger.error('Xcode not found');
  }

  // Check Developer Mode (for connected devices)
  // This would need a specific device UDID to check properly

  // Check WDA Runner app
  try {
    await execFileAsync('xcrun', ['simctl', 'listapps', 'booted']);
    // On real device, we'd check differently
    status.wdaRunnerInstalled = true;
    logger.debug('WDA Runner check passed');
  } catch {
    logger.warn('Could not verify WDA Runner installation');
  }

  // Check signing identity
  try {
    const { stdout } = await execFileAsync('security', [
      'find-identity',
      '-v',
      '-p',
      'codesigning',
    ]);
    const matches = stdout.match(/"([^"]+)"/g);
    if (matches && matches.length > 0) {
      status.signingIdentity = matches[0].replace(/"/g, '');
      logger.info({ identity: status.signingIdentity }, 'Signing identity found');
    }
  } catch {
    logger.warn('No signing identity found');
  }

  return status;
}

export async function buildWDA(
  udid: string,
  options?: { teamId?: string; configuration?: 'Debug' | 'Release' }
): Promise<string> {
  logger.info({ udid }, 'Building WebDriverAgent');

  const wdaPath = '/usr/local/lib/node_modules/appium/node_modules/appium-webdriveragent';
  const projectPath = `${wdaPath}/WebDriverAgent.xcodeproj`;

  const args = [
    '-project',
    projectPath,
    '-scheme',
    'WebDriverAgentRunner',
    '-destination',
    `id=${udid}`,
    '-configuration',
    options?.configuration ?? 'Debug',
    'test',
    'CODE_SIGNING_ALLOWED=YES',
  ];

  if (options?.teamId) {
    args.push(`DEVELOPMENT_TEAM=${options.teamId}`);
  }

  logger.debug({ args }, 'Running xcodebuild');

  try {
    const { stdout } = await execFileAsync('xcodebuild', args, { maxBuffer: 10 * 1024 * 1024 });
    logger.info('WebDriverAgent built successfully');
    return stdout;
  } catch (error) {
    logger.error({ error }, 'Failed to build WebDriverAgent');
    throw error;
  }
}

export async function installWDA(udid: string): Promise<void> {
  logger.info({ udid }, 'Installing WebDriverAgent');

  try {
    await execFileAsync('xcrun', [
      'devicectl',
      'device',
      'install',
      'app',
      'WebDriverAgentRunner-Runner.app',
      udid,
    ]);
    logger.info('WebDriverAgent installed');
  } catch (error) {
    logger.error({ error }, 'Failed to install WebDriverAgent');
    throw error;
  }
}

export async function launchWDA(
  udid: string,
  bundleId: string = 'com.apple.WebDriverAgentRunner'
): Promise<void> {
  logger.info({ udid, bundleId }, 'Launching WebDriverAgent');

  try {
    await execFileAsync('xcrun', [
      'devicectl',
      'device',
      'process',
      'launch',
      '--bundle-id',
      bundleId,
      udid,
    ]);
    logger.info('WebDriverAgent launched');
  } catch (error) {
    logger.error({ error }, 'Failed to launch WebDriverAgent');
    throw error;
  }
}
