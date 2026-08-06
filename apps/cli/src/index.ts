import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getMCPClient, type MCPToolResult } from './mcpClient.js';

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
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

interface DoctorStatus extends MCPToolResult {
  xcodeInstalled?: boolean;
  xcodeVersion?: string;
  signingIdentity?: string;
  wdaRunnerInstalled?: boolean;
}

program
  .command('doctor')
  .description('Verify Xcode, Developer Mode, and WebDriverAgent setup')
  .action(async () => {
    const spinner = ora('Checking environment...').start();

    try {
      const status = (await withClient('doctor', (client) =>
        client.callTool('doctor')
      )) as DoctorStatus;

      spinner.stop();

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

      console.log(chalk.bold('\n'));
      process.exit(status.xcodeInstalled ? 0 : 1);
    } catch (error) {
      spinner.fail('Environment check failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('connect')
  .description('Connect to an iOS device and start a session')
  .option('-u, --udid <udid>', 'Device UDID (optional, auto-detect if not provided)')
  .option('-b, --bundle-id <bundleId>', 'Bundle ID to launch on connect')
  .action(async (options) => {
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
        chalk.green(`Connected to ${result.deviceUdid ?? 'device'} (${result.deviceUdid})`)
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
  .option('-o, --output <path>', 'Output file path')
  .action(async (options) => {
    const spinner = ora('Taking screenshot...').start();

    try {
      const result = await withClient('screenshot', (client) => client.callTool('screenshot'));

      if (!result.success) {
        throw new Error(result.error ?? 'Screenshot failed');
      }

      if (result.screenshot && options.output) {
        const fs = await import('node:fs/promises');
        const buffer = Buffer.from(result.screenshot, 'base64');
        await fs.writeFile(options.output, buffer);
        spinner.succeed(chalk.green(`Screenshot saved to ${options.output}`));
      } else if (result.screenshot) {
        spinner.succeed('Screenshot captured (base64 output)');
        console.log(result.screenshot.substring(0, 100) + '...');
      } else {
        spinner.fail('No screenshot data returned');
      }
    } catch (error) {
      spinner.fail('Screenshot failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command('tap <selector>')
  .description('Tap an element by accessibility ID or label')
  .action(async (selector) => {
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
  .command('launch <bundleId>')
  .description('Launch an app by bundle ID')
  .action(async (bundleId: string) => {
    const spinner = ora(`Launching ${bundleId}...`).start();

    try {
      const result = await withClient('launch', (client) =>
        client.callTool('launchApp', { bundleId })
      );

      if (result.success) {
        spinner.succeed(chalk.green(`Launched ${bundleId}`));
      } else {
        spinner.fail(`Failed to launch: ${result.error}`);
      }
    } catch (error) {
      spinner.fail('Launch failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
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
