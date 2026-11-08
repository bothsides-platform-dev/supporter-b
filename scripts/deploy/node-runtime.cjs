// No package dependencies: this also runs before installs and from standalone artifacts.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS keeps pre-install checks usable on older runtimes. */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

function versionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error('An exact stable Node version is required.');
  }
  const parts = value.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Invalid Node version.');
  return parts;
}

function readNodePin(file) {
  const matches = [...readFileSync(file, 'utf8').matchAll(/^node\s*=\s*"(\d+\.\d+\.\d+)"\s*$/gm)];
  if (matches.length !== 1) throw new Error('mise.toml must contain one exact Node version.');
  versionParts(matches[0][1]);
  return matches[0][1];
}

function requireNodeVersion(actual, minimum) {
  const [major, minor, patch] = versionParts(actual);
  const [requiredMajor, requiredMinor, requiredPatch] = versionParts(minimum);
  if (major !== requiredMajor || minor < requiredMinor || (minor === requiredMinor && patch < requiredPatch)) {
    throw new Error(`Node ${actual} does not meet ${minimum} within the same major. Update the server runtime explicitly before deployment.`);
  }
}

function checkBuildRuntime(root, actual = process.versions.node) {
  const pin = readNodePin(join(root, 'mise.toml'));
  if (actual !== pin) throw new Error(`Build Node must match mise.toml (${pin}).`);
}

function checkReleaseRuntime(root, actual = process.versions.node) {
  const pin = readNodePin(join(root, '.ops/mise.toml'));
  const manifest = JSON.parse(readFileSync(join(root, '.release.json'), 'utf8'));
  if (manifest.nodeVersion !== pin) throw new Error('Artifact build Node does not match its mise.toml pin.');
  requireNodeVersion(actual, pin);
}

function readPnpmSpec(file) {
  const { packageManager } = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof packageManager !== 'string' ||
      !/^pnpm@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+sha(?:224|256|384|512)\.[0-9a-f]+)?$/.test(packageManager)) {
    throw new Error('package.json must pin an exact stable pnpm packageManager version.');
  }
  return packageManager;
}

function requirePnpmVersion(actual, spec) {
  const expected = spec.slice('pnpm@'.length).split('+')[0];
  if (actual !== expected) {
    throw new Error(`pnpm ${actual} does not match packageManager (${expected}). Prepare the reviewed package manager before deployment.`);
  }
}

function checkDeploymentRuntime(root) {
  requireNodeVersion(process.versions.node, readNodePin(join(root, 'mise.toml')));
  const spec = readPnpmSpec(join(root, 'package.json'));
  const actual = execFileSync('pnpm', ['--version'], { encoding: 'utf8', cwd: root, timeout: 30_000 }).trim();
  requirePnpmVersion(actual, spec);
}

module.exports = { readNodePin, requireNodeVersion, checkBuildRuntime, checkReleaseRuntime, readPnpmSpec, requirePnpmVersion };

if (require.main === module) {
  try {
    const [operation, value] = process.argv.slice(2);
    if (operation === 'check') requireNodeVersion(process.versions.node, value);
    else if (operation === 'release') checkReleaseRuntime(value);
    else if (operation === 'pnpm') console.log(readPnpmSpec(value));
    else if (operation === 'deployment') checkDeploymentRuntime(value);
    else throw new Error('Expected check <minimum version>, release/deployment <directory> or pnpm <package.json>.');
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
