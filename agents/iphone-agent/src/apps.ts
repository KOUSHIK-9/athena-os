import { createLogger } from '@athena-os/shared';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const logger = createLogger('Apps');

// Fallback map of common app names -> bundle identifiers.
// Used when devicectl (which lists installed apps) is unavailable.
const KNOWN_BUNDLE_IDS: Record<string, string> = {
  settings: 'com.apple.Preferences',
  messages: 'com.apple.MobileSMS',
  imessage: 'com.apple.MobileSMS',
  phone: 'com.apple.mobilephone',
  safari: 'com.apple.mobilesafari',
  camera: 'com.apple.camera',
  photos: 'com.apple.mobileslideshow',
  maps: 'com.apple.Maps',
  mail: 'com.apple.mobilemail',
  'app-store': 'com.apple.AppStore',
  'app store': 'com.apple.AppStore',
  youtube: 'com.google.ios.youtube',
  instagram: 'com.burbn.instagram',
  whatsapp: 'net.whatsapp.WhatsApp',
  telegram: 'ph.telegra.telegraph',
  twitter: 'com.atebits.koenieo.twitter',
  x: 'com.atebits.koenieo.twitter',
  spotify: 'com.spotify.client',
  netflix: 'com.netflix.Netflix',
};

const BUNDLE_ID_REGEX = /^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9_.-]+$/;

interface InstalledApp {
  bundleIdentifier?: string;
  localizedName?: string;
  name?: string;
}

async function listInstalledApps(udid?: string): Promise<InstalledApp[]> {
  if (!udid) return [];
  try {
    const { stdout } = await execFileAsync('xcrun', [
      'devicectl',
      'device',
      'info',
      'apps',
      '--device',
      udid,
    ]);
    const start = stdout.indexOf('{');
    if (start === -1) return [];
    const data = JSON.parse(stdout.slice(start));
    return (data.result?.apps ?? []) as InstalledApp[];
  } catch (error) {
    logger.warn({ error }, 'devicectl apps lookup failed');
    return [];
  }
}

export async function resolveAppNameToBundleId(name: string, udid?: string): Promise<string> {
  const input = name.trim();

  // Already a bundle identifier, use it directly
  if (BUNDLE_ID_REGEX.test(input)) {
    return input;
  }

  const known = KNOWN_BUNDLE_IDS[input.toLowerCase()];
  if (known) {
    logger.info({ name: input, bundleId: known }, 'Resolved from known apps');
    return known;
  }

  const query = input.toLowerCase();
  const apps = await listInstalledApps(udid);
  for (const app of apps) {
    const label = (app.localizedName ?? app.name ?? '').toLowerCase();
    if (label === query) {
      if (!app.bundleIdentifier) break;
      logger.info({ name: input, bundleId: app.bundleIdentifier }, 'Resolved from installed apps');
      return app.bundleIdentifier;
    }
  }

  throw new Error(
    `Could not resolve app "${name}" to a bundle identifier. ` +
      'Provide the bundle ID directly (com.example.app) or ensure the app is installed.'
  );
}
