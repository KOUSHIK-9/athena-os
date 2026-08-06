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

export async function discoverDevices(): Promise<ConnectedDevice[]> {
  logger.debug('Discovering connected iOS devices');

  try {
    const { stdout } = await execFileAsync('xcrun', ['devicectl', 'list', 'devices', '--json']);
    const data = JSON.parse(stdout);

    const devices: ConnectedDevice[] = [];

    for (const device of data.devices ?? []) {
      if (device.platform === 'iOS' || device.platform === 'iPadOS') {
        devices.push({
          udid: device.udid,
          name: device.name,
          model: device.modelName ?? device.model ?? 'Unknown',
          osVersion: device.osVersion ?? 'Unknown',
          isSimulator: device.isSimulator ?? false,
          developerMode: device.developerModeEnabled ?? false,
          isAvailable: device.isAvailable ?? true,
        });
      }
    }

    logger.info({ count: devices.length }, 'Discovered iOS devices');
    return devices;
  } catch (error) {
    logger.warn({ error }, 'Failed to discover devices via devicectl, falling back to idevice_id');

    try {
      const { stdout } = await execFileAsync('idevice_id', ['-l']);
      const udids = stdout.trim().split('\n').filter(Boolean);

      const devices: ConnectedDevice[] = [];
      for (const udid of udids) {
        const info = await getDeviceInfo(udid);
        devices.push({ ...info, isAvailable: true });
      }

      return devices;
    } catch (fallbackError) {
      logger.error({ error: fallbackError }, 'Failed to discover devices');
      return [];
    }
  }
}

export async function getDeviceInfo(udid: string): Promise<DeviceInfo> {
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
    const { stdout } = await execFileAsync('xcrun', [
      'devicectl',
      'device',
      'info',
      udid,
      '--json',
    ]);
    const data = JSON.parse(stdout);
    return data.developerModeEnabled ?? false;
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

  if (explicitUdid) {
    const device = devices.find((d) => d.udid === explicitUdid);
    if (!device) {
      throw new DeviceNotFoundError(`Device not found: ${explicitUdid}`);
    }
    if (options?.requireDeveloperMode && !device.developerMode) {
      throw new DeviceNotReadyError(device.udid, 'Developer Mode is not enabled');
    }
    return device;
  }

  const availableDevices = devices.filter((d) => d.isAvailable);

  if (availableDevices.length === 0) {
    throw new DeviceNotReadyError('all', 'No available devices found');
  }

  if (availableDevices.length === 1) {
    const device = availableDevices[0];
    if (options?.requireDeveloperMode && !device.developerMode) {
      throw new DeviceNotReadyError(device.udid, 'Developer Mode is not enabled');
    }
    return device;
  }

  // Multiple devices - would need interactive prompt in CLI
  // For now, throw an error requiring explicit UDID
  throw new Error(
    `Multiple devices connected. Please specify UDID via ATHENA_DEVICE_UDID:\n` +
      availableDevices
        .map((d) => `  ${d.udid} - ${d.name} (${d.model}, iOS ${d.osVersion})`)
        .join('\n')
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
