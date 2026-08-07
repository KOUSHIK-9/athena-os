#!/usr/bin/env node
/**
 * Architecture dependency pyramid check.
 *
 * Enforces:
 *   core < driver < executor < iphone-agent < sdk / mcp-server < cli
 *   No package imports a package above its layer.
 *   No Appium mention leaks outside the driver package.
 *   shared is a utility package and may be imported by any layer.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

const PACKAGES = {
  'packages/core': '@athena-os/core',
  'packages/driver': '@athena-os/driver',
  'packages/executor': '@athena-os/executor',
  'packages/sdk': '@athena-os/sdk',
  'packages/shared': '@athena-os/shared',
  'packages/understanding': '@athena-os/understanding',
  'packages/reasoning': '@athena-os/reasoning',
  'agents/iphone-agent': '@athena-os/iphone-agent',
  'servers/mcp-server': '@athena-os/mcp-server',
  'apps/cli': '@athena-os/cli',
};

const LAYERS = {
  '@athena-os/core': 0,
  '@athena-os/driver': 1,
  '@athena-os/understanding': 1,
  '@athena-os/reasoning': 1,
  '@athena-os/executor': 2,
  '@athena-os/iphone-agent': 3,
  '@athena-os/sdk': 4,
  '@athena-os/mcp-server': 4,
  '@athena-os/cli': 5,
};

// Packages that must not reference Appium at all (public/transport layers).
// The iphone-agent is allowed to reference AppiumDriver since it wraps the driver.
const APPIUM_FORBIDDEN = new Set([
  '@athena-os/core',
  '@athena-os/executor',
  '@athena-os/shared',
  '@athena-os/sdk',
  '@athena-os/understanding',
  '@athena-os/reasoning',
  '@athena-os/mcp-server',
  '@athena-os/cli',
]);

function listSrcFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('._') || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'dist' || entry === 'node_modules' || entry === '.turbo') continue;
      out.push(...listSrcFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

for (const [pkgDir, srcImport] of Object.entries(PACKAGES)) {
  const srcLayer = LAYERS[srcImport];
  if (srcLayer === undefined) continue;

  const files = listSrcFiles(join(ROOT, pkgDir, 'src'));
  for (const file of files) {
    const content = readFileSync(file, 'utf8');

    if (/appium/gi.test(content) && APPIUM_FORBIDDEN.has(srcImport)) {
      violations.push(`${relative(ROOT, file)}: contains 'appium' outside the driver package`);
    }

    for (const [depName, depImport] of Object.entries(PACKAGES)) {
      if (depImport === srcImport) continue;
      const depLayer = LAYERS[depImport];
      if (depLayer === undefined) continue;

      if (content.includes(`'${depImport}'`) && depLayer > srcLayer) {
        violations.push(
          `${relative(ROOT, file)}: pyramid violation (${srcImport} imports upward → ${depImport})`
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error('ARCHITECTURE VIOLATIONS:');
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}

console.log('Architecture check passed: dependency pyramid and Appium boundary enforced.');