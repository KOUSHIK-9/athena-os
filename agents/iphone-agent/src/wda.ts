import { createLogger } from '@athena-os/shared';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const logger = createLogger('WDA');

export const WDA_RUNNER_BUNDLE_ID = 'com.apple.WebDriverAgentRunner';

/** Resolve the appium-xcuitest-driver bundled WebDriverAgent source tree. */
export function resolveWDAPath(override?: string): string {
  if (override) return override;

  const candidates = [
    process.env.ATHENA_WDA_PATH,
    join(
      homedir(),
      '.appium/node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent/WebDriverAgent.xcodeproj',
    ),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    'WebDriverAgent source not found. Install the xcuitest driver (appium driver install xcuitest) ' +
      'or set ATHENA_WDA_PATH.',
  );
}

export interface WDAStatus {
  xcodeInstalled: boolean;
  xcodeVersion?: string;
  developerModeEnabled: boolean;
  wdaRunnerInstalled: boolean;
  wdaRunnerPath?: string;
  signingIdentity?: string;
  teamId?: string;
}

export async function verifyWDA(): Promise<WDAStatus> {
  logger.info('Verifying WebDriverAgent setup');

  const status: WDAStatus = {
    xcodeInstalled: false,
    developerModeEnabled: false,
    wdaRunnerInstalled: false,
  };

  try {
    const { stdout } = await execFileAsync('xcodebuild', ['-version']);
    status.xcodeInstalled = true;
    status.xcodeVersion = stdout.trim().split('\n')[0];
    logger.info({ version: status.xcodeVersion }, 'Xcode found');
  } catch {
    logger.error('Xcode not found');
  }

  try {
    const wdaPath = resolveWDAPath();
    status.wdaRunnerPath = wdaPath;
    status.wdaRunnerInstalled = existsSync(wdaPath);
  } catch (error) {
    logger.warn({ error }, 'WebDriverAgent source not found');
  }

  try {
    const { stdout } = await execFileAsync('security', [
      'find-identity',
      '-v',
      '-p',
      'codesigning',
    ]);
    const match = stdout.match(/"([^"]+)"/);
    if (match) {
      status.signingIdentity = match[1];
      const team = match[1].match(/\(([A-Fa-f0-9]{10})\)$/);
      if (team) status.teamId = team[1];
      logger.info({ identity: status.signingIdentity, teamId: status.teamId }, 'Signing identity found');
    }
  } catch {
    logger.warn('No signing identity found');
  }

  return status;
}

export interface BuildWDAOptions {
  teamId?: string;
  signingIdentity?: string;
  configuration?: 'Debug' | 'Release';
  derivedDataPath?: string;
}

/**
 * Build the WebDriverAgentRunner test bundle for a physical device and return
 * the path to the runnable XCTest runner app.
 */
export async function buildWDA(
  udid: string,
  options?: BuildWDAOptions
): Promise<string> {
  const projectPath = resolveWDAPath();
  const teamId = options?.teamId ?? process.env.ATHENA_XCODE_TEAM_ID;
  const signingIdentity =
    options?.signingIdentity ?? process.env.ATHENA_XCODE_SIGNING_ID;
  const configuration = options?.configuration ?? 'Debug';

  if (!teamId) {
    throw new Error(
      'No Apple Developer Team ID configured. Set ATHENA_XCODE_TEAM_ID or pass teamId.',
    );
  }

  const derivedDataPath =
    options?.derivedDataPath ?? join(homedir(), 'Library/Developer/Xcode/DerivedDataAthenaWDA');

  const args = [
    '-project',
    projectPath,
    '-scheme',
    'WebDriverAgentRunner',
    '-destination',
    `id=${udid}`,
    '-configuration',
    configuration,
    '-derivedDataPath',
    derivedDataPath,
    'build-for-testing',
    `DEVELOPMENT_TEAM=${teamId}`,
    'CODE_SIGNING_ALLOWED=YES',
  ];

  if (signingIdentity) {
    args.push(`CODE_SIGN_IDENTITY=${signingIdentity}`);
  }

  logger.info({ udid, teamId, signingIdentity }, 'Building WebDriverAgent');

  try {
    await execFileAsync('xcodebuild', args, { maxBuffer: 20 * 1024 * 1024 });
    const runnerApp = join(
      derivedDataPath,
      'Build/Products',
      `${configuration}-iphoneos`,
      'WebDriverAgentRunner-Runner.app',
    );
    if (!existsSync(runnerApp)) {
      throw new Error(`WDA build succeeded but runner app missing: ${runnerApp}`);
    }
    logger.info({ runnerApp }, 'WebDriverAgent built successfully');
    return runnerApp;
  } catch (error) {
    logger.error({ error }, 'Failed to build WebDriverAgent');
    throw error;
  }
}

export async function installWDA(
  udid: string,
  runnerApp: string
): Promise<void> {
  logger.info({ udid, runnerApp }, 'Installing WebDriverAgent');

  try {
    await execFileAsync(
      'xcrun',
      ['devicectl', 'device', 'install', 'app', '--device', udid, runnerApp],
      { maxBuffer: 10 * 1024 * 1024 }
    );
    logger.info('WebDriverAgent installed');
  } catch (error) {
    logger.error({ error }, 'Failed to install WebDriverAgent');
    throw error;
  }
}

export async function launchWDA(
  udid: string,
  bundleId: string = WDA_RUNNER_BUNDLE_ID
): Promise<void> {
  logger.info({ udid, bundleId }, 'Launching WebDriverAgent');

  try {
    await execFileAsync('xcrun', [
      'devicectl',
      'device',
      'process',
      'launch',
      '--device',
      udid,
      bundleId,
    ]);
    logger.info('WebDriverAgent launched');
  } catch (error) {
    logger.error({ error }, 'Failed to launch WebDriverAgent');
    throw error;
  }
}