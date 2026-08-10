import type { DeviceInfo } from '@athena-os/core';
import { DeviceNotFoundError, DeviceNotReadyError } from '@athena-os/shared';
import { createLogger } from '@athena-os/shared';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const logger = createLogger('DeviceManager');

export interface ConnectedDevice extends DeviceInfo {
  isAvailable: boolean;
}

export interface DeviceDiscovery {
  readonly name: string;
  discover(): Promise<ConnectedDevice[]>;
}

class DevicectlDiscovery implements DeviceDiscovery {
  readonly name = 'devicectl';

  async discover(): Promise<ConnectedDevice[]> {
    const { stdout } = await execFileAsync('xcrun', [
      'devicectl',
      'list',
      'devices',
      '--json-output',
      '-',
    ]);
    const data = JSON.parse(stdout);

    const devices: ConnectedDevice[] = [];

    for (const device of data.result?.devices ?? []) {
      const props = device.deviceProperties ?? {};
      const hw = device.hardwareProperties ?? {};
      const conn = device.connectionProperties ?? {};

      if (hw.platform !== 'iOS' && hw.platform !== 'iPadOS') continue;

      devices.push({
        udid: device.identifier ?? hw.udid,
        name: props.name ?? hw.marketingName ?? 'Unknown',
        model: hw.productType ?? hw.marketingName ?? 'Unknown',
        osVersion: props.osVersionNumber ?? 'Unknown',
        isSimulator: hw.deviceType === 'simulator',
        developerMode: props.developerModeStatus === 'enabled',
        isAvailable: conn.tunnelState !== 'unavailable',
      });
    }

    logger.info({ count: devices.length }, 'devicectl discovered iOS devices');
    return devices;
  }
}

class LibIMobileDeviceDiscovery implements DeviceDiscovery {
  readonly name = 'libimobiledevice';

  async discover(): Promise<ConnectedDevice[]> {
    const { stdout } = await execFileAsync('idevice_id', ['-l']);
    const udids = stdout.trim().split('\n').filter(Boolean);

    const devices: ConnectedDevice[] = [];
    for (const udid of udids) {
      try {
        const info = await getDeviceInfo(udid);
        devices.push({ ...info, isAvailable: true });
      } catch (error) {
        logger.warn({ udid, error }, 'libimobiledevice could not read device info');
      }
    }

    logger.info({ count: devices.length }, 'libimobiledevice discovered iOS devices');
    return devices;
  }
}

interface SimulatorEntry {
  udid: string;
  name: string;
  state: string;
  osVersion: string;
}

function parseSimulatorRuntime(runtime: string): string {
  const match = runtime.match(/iOS-(\d+)-(\d+)/);
  return match ? `${match[1]}.${match[2]}` : 'unknown';
}

async function listSimulators(): Promise<SimulatorEntry[]> {
  const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', '--json']);
  const data = JSON.parse(stdout);

  const entries: SimulatorEntry[] = [];
  for (const runtime of Object.keys(data.devices ?? {})) {
    const osVersion = parseSimulatorRuntime(runtime);
    for (const device of data.devices[runtime] ?? []) {
      entries.push({
        udid: device.udid,
        name: device.name,
        state: device.state,
        osVersion,
      });
    }
  }
  return entries;
}

class SimctlDiscovery implements DeviceDiscovery {
  readonly name = 'simctl';

  async discover(): Promise<ConnectedDevice[]> {
    const simulators = await listSimulators();

    const devices: ConnectedDevice[] = [];
    for (const sim of simulators) {
      devices.push({
        udid: sim.udid,
        name: sim.name,
        model: sim.name,
        osVersion: sim.osVersion,
        isSimulator: true,
        developerMode: true,
        isAvailable: sim.state === 'Booted',
      });
    }

    logger.info(
      { count: devices.length, booted: devices.filter((d) => d.isAvailable).length },
      'simctl discovered iOS simulators'
    );
    return devices;
  }
}

async function findSimulator(udid: string): Promise<SimulatorEntry | undefined> {
  const simulators = await listSimulators();
  return simulators.find((sim) => sim.udid === udid);
}

export const devicectlDiscovery = new DevicectlDiscovery();
export const libIMobileDiscovery = new LibIMobileDeviceDiscovery();
export const simctlDiscovery = new SimctlDiscovery();

export async function discoverDevices(): Promise<ConnectedDevice[]> {
  logger.debug('Discovering connected iOS devices');

  const providers: DeviceDiscovery[] = [devicectlDiscovery, simctlDiscovery, libIMobileDiscovery];

  const seen = new Set<string>();
  const all: ConnectedDevice[] = [];

  for (const provider of providers) {
    try {
      const devices = await provider.discover();
      for (const device of devices) {
        if (!seen.has(device.udid)) {
          seen.add(device.udid);
          all.push(device);
        }
      }
    } catch (error) {
      logger.warn({ provider: provider.name, error }, 'device discovery failed');
    }
  }

  return all;
}

export async function getDeviceInfo(udid: string): Promise<DeviceInfo> {
  try {
    const { stdout } = await execFileAsync('xcrun', [
      'devicectl',
      'list',
      'devices',
      '--json-output',
      '-',
    ]);
    const data = JSON.parse(stdout);
    const device = (data.result?.devices ?? []).find(
      (d: Record<string, unknown>) => d.identifier === udid
    );

    if (device) {
      const props = device.deviceProperties ?? {};
      const hw = device.hardwareProperties ?? {};
      return {
        udid,
        name: props.name ?? hw.marketingName ?? 'Unknown',
        model: hw.productType ?? hw.marketingName ?? 'Unknown',
        osVersion: props.osVersionNumber ?? 'Unknown',
        isSimulator: hw.deviceType === 'simulator',
        developerMode: props.developerModeStatus === 'enabled',
      };
    }
  } catch (error) {
    logger.warn({ udid, error }, 'devicectl device info failed, falling back to simctl');
  }

  try {
    const sim = await findSimulator(udid);
    if (sim) {
      return {
        udid,
        name: sim.name,
        model: sim.name,
        osVersion: sim.osVersion,
        isSimulator: true,
        developerMode: true,
      };
    }
  } catch (error) {
    logger.warn({ udid, error }, 'simctl device info failed, falling back to ideviceinfo');
  }

  try {
    const { stdout } = await execFileAsync('ideviceinfo', [
      '-u',
      udid,
      '-k',
      'DeviceName,ProductType,ProductVersion',
    ]);
    const lines = stdout.trim().split('\n');

    const info: Partial<DeviceInfo> = { udid };

    for (const line of lines) {
      const [key, value] = line.split(': ').map((s) => s.trim());
      if (key === 'DeviceName') info.name = value;
      else if (key === 'ProductType') info.model = value;
      else if (key === 'ProductVersion') info.osVersion = value;
    }

    return {
      udid: info.udid!,
      name: info.name ?? 'Unknown',
      model: info.model ?? 'Unknown',
      osVersion: info.osVersion ?? 'Unknown',
      isSimulator: false,
      developerMode: await checkDeveloperMode(udid),
    };
  } catch {
    throw new DeviceNotFoundError(udid);
  }
}

export async function checkDeveloperMode(udid: string): Promise<boolean> {
  try {
    const sim = await findSimulator(udid);
    if (sim) return sim.state === 'Booted';
  } catch {
    // fall through to devicectl
  }

  try {
    const { stdout } = await execFileAsync('xcrun', [
      'devicectl',
      'list',
      'devices',
      '--json-output',
      '-',
    ]);
    const data = JSON.parse(stdout);
    const device = (data.result?.devices ?? []).find(
      (d: Record<string, unknown>) => d.identifier === udid
    );
    return device?.deviceProperties?.developerModeStatus === 'enabled';
  } catch {
    return false;
  }
}

export async function selectDevice(
  explicitUdid?: string,
  options?: { requireDeveloperMode?: boolean }
): Promise<ConnectedDevice> {
  const devices = await discoverDevices();

  if (devices.length === 0) {
    throw new DeviceNotFoundError(
      'No iOS devices found. Connect a device and enable Developer Mode.'
    );
  }

  const requested = explicitUdid ?? process.env.ATHENA_DEVICE_UDID;

  if (requested) {
    const device = devices.find((d) => d.udid === requested);
    if (!device) {
      throw new DeviceNotFoundError(`Device not found: ${requested}`);
    }
    if (requested === explicitUdid && options?.requireDeveloperMode && !device.developerMode) {
      throw new DeviceNotReadyError(device.udid, 'Developer Mode is not enabled');
    }
    return device;
  }

  const available = devices.filter((d) => d.isAvailable);
  // Prefer booted simulators so `athena run` targets a simulator out of the
  // box when one is running; physical devices remain the fallback.
  const ready =
    available.filter((d) => d.isSimulator).length > 0
      ? available.filter((d) => d.isSimulator)
      : available;

  if (ready.length === 0) {
    throw new DeviceNotReadyError('all', 'No available devices found');
  }

  if (ready.length === 1) {
    const device = ready[0];
    if (options?.requireDeveloperMode && !device.developerMode) {
      throw new DeviceNotReadyError(device.udid, 'Developer Mode is not enabled');
    }
    return device;
  }

  // Multiple devices - would need interactive prompt in CLI
  // For now, throw an error requiring explicit UDID
  throw new Error(
    `Multiple devices connected. Please specify UDID via ATHENA_DEVICE_UDID:\n` +
      ready.map((d) => `  ${d.udid} - ${d.name} (${d.model}, iOS ${d.osVersion})`).join('\n')
  );
}

export async function verifyDeviceReady(udid: string): Promise<void> {
  const device = await getDeviceInfo(udid);
  if (!device.developerMode) {
    throw new DeviceNotReadyError(
      udid,
      'Developer Mode is not enabled. Enable in Settings > Privacy & Security > Developer Mode'
    );
  }
}
