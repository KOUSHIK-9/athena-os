import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getMCPClient, type MCPToolResult } from './mcpClient.js';
import { BUDGETS } from './metrics.js';

const program = new Command();

program
  .name('athena')
  .description('Athena OS - AI Execution Platform for iOS')
  .version('0.0.1')
  .option('-v, --verbose', 'Enable verbose logging')
  .hook('preAction', (_, action) => {
    if (action.opts().verbose) {
      process.env.LOG_LEVEL = 'debug';
    }
  });

async function withClient<T>(
  label: string,
  fn: (client: Awaited<ReturnType<typeof getMCPClient>>) => Promise<T>
): Promise<T> {
  const client = await getMCPClient();
  const t0 = Date.now();
  try {
    const result = await fn(client);
    const totalMs = Date.now() - t0;
    const budget = BUDGETS[label];
    if (budget !== undefined && totalMs > budget) {
      console.warn(chalk.yellow(`⚠ ${label} exceeded budget (${totalMs}ms > ${budget}ms)`));
      const timings = (result as { timings?: Record<string, number> } | undefined)?.timings;
      if (timings) {
        printBudgetBreakdown(label, timings);
      }
    }
    return result;
  } finally {
    await client.close();
  }
}

function printBudgetBreakdown(label: string, timings?: Record<string, number>): void {
  if (!timings) return;
  const parts = Object.entries(timings)
    .map(([k, ms]) => `${k}: ${ms}ms`)
    .join(', ');
  console.log(chalk.gray(`  (${label} timing: ${parts})`));
}

type CommandOpts = { json?: boolean; [key: string]: unknown };

function emitJson(result: unknown): void {
  console.log(JSON.stringify(result, null, 2));
}

interface DeviceEntry {
  udid: string;
  name: string;
  model?: string;
  osVersion?: string;
  isSimulator?: boolean;
  developerMode?: boolean;
  isAvailable?: boolean;
}

interface DoctorStatus extends MCPToolResult {
  xcodeInstalled?: boolean;
  xcodeVersion?: string;
  signingIdentity?: string;
  wdaRunnerInstalled?: boolean;
  devices?: DeviceEntry[];
}

function printDevices(devices: DeviceEntry[]): void {
  console.log(chalk.bold('\n📱 Connected Devices\n'));

  if (devices.length === 0) {
    console.log(
      chalk.yellow('  No iOS devices found. Connect a device and enable Developer Mode.')
    );
    console.log(chalk.bold('\n'));
    return;
  }

  for (const device of devices) {
    const status = device.isAvailable ? chalk.green('✓') : chalk.red('✗');
    const devMode = device.developerMode ? chalk.green('Enabled') : chalk.yellow('Disabled');
    console.log(`  ${status} ${chalk.bold(device.name)}`);
    console.log(`    UDID:           ${device.udid}`);
    console.log(`    Model:          ${device.model ?? 'Unknown'}`);
    console.log(`    iOS Version:     ${device.osVersion ?? 'Unknown'}`);
    console.log(`    Developer Mode:  ${devMode}`);
    console.log(
      `    Status:         ${device.isAvailable ? chalk.green('Available') : chalk.red('Unavailable')}`
    );
    console.log('');
  }
}

program
  .command('doctor')
  .description('Verify Xcode, Developer Mode, and WebDriverAgent setup')
  .option('-j, --json', 'Output as JSON')
  .action(async (cmd: CommandOpts) => {
    const spinner = cmd.json ? null : ora('Checking environment...').start();

    await withClient('doctor', async (client) => {
      const status = (await client.callTool('doctor')) as DoctorStatus;

      if (cmd.json) {
        emitJson({
          success: status.success,
          node: process.execPath,
          xcode: status.xcodeInstalled
            ? { installed: true, version: status.xcodeVersion }
            : { installed: false },
          signingIdentity: status.signingIdentity ?? null,
          wda: status.wdaRunnerInstalled ? 'available' : 'not-verified',
          devices: status.devices ?? [],
          timings: status.timings ?? {},
        });
        return;
      }

      spinner?.stop();

      console.log(chalk.bold('\n🔍 Athena OS Environment Check\n'));

      console.log(chalk.cyan('Xcode:'));
      if (status.xcodeInstalled) {
        console.log(chalk.green(`  ✓ Installed: ${status.xcodeVersion}`));
      } else {
        console.log(chalk.red('  ✗ Not installed'));
      }

      console.log(chalk.cyan('\nSigning Identity:'));
      if (status.signingIdentity) {
        console.log(chalk.green(`  ✓ Found: ${status.signingIdentity}`));
      } else {
        console.log(chalk.yellow('  ⚠ No signing identity found'));
      }

      console.log(chalk.cyan('\nWebDriverAgent:'));
      if (status.wdaRunnerInstalled) {
        console.log(chalk.green('  ✓ Available'));
      } else {
        console.log(chalk.yellow('  ⚠ Not verified (will build on first connect)'));
      }

      console.log(chalk.cyan('\nDevices:'));
      if (status.devices && status.devices.length > 0) {
        for (const device of status.devices) {
          const mark = device.isAvailable ? chalk.green('✓') : chalk.red('✗');
          console.log(
            `  ${mark} ${chalk.bold(device.name)} (${device.osVersion ?? 'unknown iOS'})` +
              `${device.isAvailable ? '' : chalk.gray(' — unavailable')}`
          );
        }
      } else {
        console.log(chalk.yellow('  ⚠ No devices found'));
      }

      console.log(chalk.bold('\n'));

      if (status.timings) {
        const t = status.timings;
        console.log(
          chalk.gray(
            `  (xcode+wda: ${t.xcodeWdaMs ?? '?'}ms, devices: ${t.devicesMs ?? '?'}ms, total: ${t.totalMs ?? '?'}ms)`
          )
        );
      }

      if (!status.success) {
        throw new Error(status.error ?? 'Environment check failed');
      }
      process.exit(status.xcodeInstalled ? 0 : 1);
    });
  });

program
  .command('devices')
  .description('List connected iOS devices')
  .option('-j, --json', 'Output as JSON')
  .action(async (cmd: { json?: boolean }) => {
    const spinner = cmd.json ? null : ora('Discovering devices...').start();

    await withClient('devices', async (client) => {
      const result = await client.callTool('devices');

      spinner?.stop();

      if (!result.success || !Array.isArray(result.devices)) {
        throw new Error(result.error ?? 'Failed to discover devices');
      }

      const devices = result.devices as DeviceEntry[];

      if (cmd.json) {
        emitJson({ success: true, devices, timings: result.timings ?? {} });
        return;
      }

      printDevices(devices);
    });
  });

program
  .command('connect')
  .description('Connect to an iOS device and start a session')
  .option('-u, --udid <udid>', 'Device UDID (optional, auto-detect if not provided)')
  .option('-b, --bundle-id <bundleId>', 'Bundle ID to launch on connect')
  .action(async (options: { udid?: string; bundleId?: string }) => {
    const spinner = ora('Connecting to device...').start();

    try {
      const result = await withClient('connect', (client) =>
        client.callTool('connect', {
          udid: options.udid,
          bundleId: options.bundleId,
        })
      );

      if (!result.success) {
        throw new Error(result.error ?? 'Connection failed');
      }

      if (options.bundleId) {
        spinner.text = `Launching ${options.bundleId}...`;
        const client = await getMCPClient();
        await client.callTool('launchApp', { bundleId: options.bundleId });
        await client.close();
      }

      spinner.succeed(
        chalk.green(
          `Connected to ${result.deviceName ?? result.deviceUdid ?? 'device'} (${result.deviceUdid})`
        )
      );
      console.log(chalk.gray('\nSession ready. Use other commands to interact with the device.'));
      console.log(chalk.gray("Run 'athena disconnect' to end the session.\n"));
    } catch (error) {
      spinner.fail('Connection failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('screenshot')
  .description('Take a screenshot')
  .option('-o, --output <path>', 'Override output file path')
  .option('-j, --json', 'Output metadata as JSON')
  .action(async (cmd: { output?: string; json?: boolean }) => {
    const spinner = cmd.json ? null : ora('Taking screenshot...').start();

    await withClient('screenshot', async (client) => {
      const result = await client.callTool('screenshot');

      if (!result.success || !result.screenshot) {
        throw new Error(result.error ?? 'Screenshot failed');
      }

      const buffer = Buffer.from(result.screenshot, 'base64');
      const engineMeta =
        (result.metadata as {
          path?: string;
          width?: number;
          height?: number;
          format?: string;
          device?: string;
          orientation?: string;
          timestamp?: string;
          verified?: boolean;
        } | null) ?? {};

      let output = engineMeta.path ?? './screenshots/latest.png';
      if (cmd.output) {
        output = cmd.output;
        const fs = await import('node:fs');
        const { dirname } = await import('node:path');
        await fs.promises.mkdir(dirname(output), { recursive: true });
        await fs.promises.writeFile(output, buffer);
      }

      const meta = {
        success: true,
        device: engineMeta.device ?? result.deviceUdid ?? null,
        timestamp: engineMeta.timestamp ?? new Date().toISOString(),
        width: engineMeta.width,
        height: engineMeta.height,
        format: engineMeta.format ?? 'png',
        orientation: engineMeta.orientation,
        path: output,
        bytes: buffer.length,
        verified: engineMeta.verified ?? true,
      };

      if (cmd.json) {
        emitJson(meta);
        return;
      }

      spinner?.succeed(chalk.green(`Screenshot saved to ${output}`));
      console.log(chalk.gray(`  device:    ${meta.device ?? 'unknown'}`));
      console.log(chalk.gray(`  timestamp: ${meta.timestamp}`));
      console.log(
        chalk.gray(`  size:      ${meta.width ?? '?'}×${meta.height ?? '?'} (${meta.format})`)
      );
      if (meta.orientation) console.log(chalk.gray(`  orientation: ${meta.orientation}`));
      console.log(chalk.gray(`  bytes:     ${meta.bytes}`));
      console.log(
        meta.verified
          ? chalk.green('  verified:  ✓')
          : chalk.yellow('  verified:  ✗ file verification failed')
      );
    });
  });

program
  .command('tap <selector>')
  .description('Tap an element by accessibility ID or label')
  .action(async (selector: string) => {
    const spinner = ora(`Tapping "${selector}"...`).start();

    try {
      const result = await withClient('tap', (client) =>
        client.callTool('tap', {
          selector: { type: 'accessibilityId', value: selector },
        })
      );

      if (result.success) {
        spinner.succeed(chalk.green(`Tapped "${selector}"`));
      } else {
        spinner.fail(`Failed to tap: ${result.error}`);
      }
    } catch (error) {
      spinner.fail('Tap failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('type <text>')
  .description('Type text into the focused element')
  .option(
    '-s, --selector <selector>',
    'Element selector (optional, uses focused element if not provided)'
  )
  .action(async (text: string, cmd: { opts: () => { selector?: string } }) => {
    const spinner = ora(`Typing "${text}"...`).start();

    try {
      const selector = cmd.opts().selector
        ? { type: 'accessibilityId' as const, value: cmd.opts().selector }
        : undefined;

      const result = await withClient('type', (client) =>
        client.callTool('type', { text, selector })
      );

      if (result.success) {
        spinner.succeed(chalk.green(`Typed "${text}"`));
      } else {
        spinner.fail(`Failed to type: ${result.error}`);
      }
    } catch (error) {
      spinner.fail('Type failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('launch <app>')
  .description('Launch an app by name (e.g. Settings) or bundle ID')
  .option('-j, --json', 'Output metadata as JSON')
  .action(async (app: string, cmd: { json?: boolean }) => {
    const spinner = cmd.json ? null : ora(`Launching "${app}"...`).start();

    await withClient('launch', async (client) => {
      const result = await client.callTool('launchApp', { app });

      if (!result.success) {
        throw new Error(result.error ?? 'Launch failed');
      }

      if (cmd.json) {
        emitJson({ success: true, ...result });
        return;
      }

      spinner?.succeed(chalk.green(`Launched "${app}"`));
      if (result.resolvedFrom && result.resolvedFrom !== result.bundleId) {
        console.log(
          chalk.gray(`  bundle: ${result.bundleId} (resolved from "${result.resolvedFrom}")`)
        );
      } else if (result.bundleId) {
        console.log(chalk.gray(`  bundle: ${result.bundleId}`));
      }
    });
  });

program
  .command('home')
  .description('Press the home button')
  .action(async () => {
    const spinner = ora('Pressing home button...').start();

    try {
      const result = await withClient('home', (client) => client.callTool('pressHome'));

      if (result.success) {
        spinner.succeed(chalk.green('Home button pressed'));
      } else {
        spinner.fail(`Failed: ${result.error}`);
      }
    } catch (error) {
      spinner.fail('Home failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('tree')
  .description('Print the accessibility tree')
  .action(async () => {
    const spinner = ora('Getting accessibility tree...').start();

    try {
      const result = await withClient('tree', (client) => client.callTool('getTree'));

      spinner.stop();

      if (result.success && result.metadata?.tree) {
        console.log(JSON.stringify(result.metadata.tree, null, 2));
      } else {
        console.error(chalk.red(result.error ?? 'Failed to get tree'));
      }
    } catch (error) {
      spinner.fail('Tree failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('disconnect')
  .description('Disconnect from the device and close the session')
  .action(async () => {
    const spinner = ora('Disconnecting...').start();

    try {
      const result = await withClient('disconnect', (client) => client.callTool('disconnect'));

      if (result.success) {
        spinner.succeed(chalk.green('Disconnected'));
      } else {
        throw new Error(result.error ?? 'Disconnect failed');
      }
    } catch (error) {
      spinner.fail('Disconnect failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red(error.message));
  process.exit(1);
});
