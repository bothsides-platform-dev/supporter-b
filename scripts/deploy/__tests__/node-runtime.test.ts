// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const policy = createRequire(import.meta.url)('../node-runtime.cjs') as {
  requireNodeVersion(actual: unknown, minimum: unknown): void;
  readPnpmSpec(file: string): string;
  requirePnpmVersion(actual: string, spec: string): void;
};
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

it.each(['22.23.4', '22.23.5', '22.24.0'])('allows %s within the reviewed major and above the security floor', version => {
  expect(() => policy.requireNodeVersion(version, '22.23.4')).not.toThrow();
});

it.each(['22.0.0', '22.23.3', '21.99.99', '23.0.0', '24.22.1', '22.23.4-rc.1', 'v22.23.4', undefined])(
  'rejects an outdated, different-major or malformed runtime: %s', version => {
    expect(() => policy.requireNodeVersion(version, '22.23.4')).toThrow();
  },
);

it('accepts the exact pnpm pin, including a hash-pinned packageManager specification', () => {
  expect(() => policy.requirePnpmVersion('10.34.9', 'pnpm@10.34.9')).not.toThrow();
  expect(() => policy.requirePnpmVersion('10.34.9', `pnpm@10.34.9+sha512.${'a'.repeat(128)}`)).not.toThrow();
});

it.each(['9.15.9', '10.34.4', '10.34.10', '11.11.0'])('rejects a different actual pnpm version: %s', actual => {
  expect(() => policy.requirePnpmVersion(actual, 'pnpm@10.34.9')).toThrow();
});

it.each(['pnpm@10.34.5', `pnpm@10.34.5+sha512.${'a'.repeat(128)}`])('uses the exact package manager spec %s', spec => {
  const root = mkdtempSync(join(tmpdir(), 'package-manager-'));
  roots.push(root);
  const file = join(root, 'package.json');
  writeFileSync(file, JSON.stringify({ packageManager: spec }));
  expect(policy.readPnpmSpec(file)).toBe(spec);
});

it.each([undefined, 'pnpm@9', 'pnpm@latest', 'pnpm@^10.34.5', 'pnpm@10.34.5-rc.1', 'npm@10.9.9', 'https://example.test/pnpm.js'])(
  'rejects an unpinned or unsupported package manager: %s', spec => {
    const root = mkdtempSync(join(tmpdir(), 'package-manager-'));
    roots.push(root);
    const file = join(root, 'package.json');
    writeFileSync(file, JSON.stringify({ packageManager: spec }));
    expect(() => policy.readPnpmSpec(file)).toThrow();
  },
);

function bootstrapFixture() {
  const root = mkdtempSync(join(tmpdir(), 'node-bootstrap-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts/deploy'), { recursive: true });
  mkdirSync(join(root, 'bin'));
  copyFileSync(resolve('scripts/deploy/lightsail-bootstrap.sh'), join(root, 'scripts/deploy/lightsail-bootstrap.sh'));
  copyFileSync(resolve('scripts/deploy/node-runtime.cjs'), join(root, 'scripts/deploy/node-runtime.cjs'));
  writeFileSync(join(root, 'mise.toml'), '[tools]\nnode = "22.23.4"\n');
  // Simulate an already installed old Node while still executing the real guard.
  writeFileSync(join(root, 'old-node.cjs'), 'Object.defineProperty(process.versions, "node", { value: "22.0.0" });');
  writeFileSync(join(root, 'bin/node'), '#!/bin/bash\nexec "$BOOTSTRAP_TEST_NODE" --require "$BOOTSTRAP_TEST_ROOT/old-node.cjs" "$@"\n', { mode: 0o755 });
  writeFileSync(join(root, 'bin/sudo'), '#!/bin/bash\ntouch "$BOOTSTRAP_TEST_ROOT/host-mutated"\nexit 79\n', { mode: 0o755 });
  const run = (extra: Record<string, string> = {}) => spawnSync('bash', [join(root, 'scripts/deploy/lightsail-bootstrap.sh')], {
    encoding: 'utf8', env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, BOOTSTRAP_TEST_NODE: process.execPath, BOOTSTRAP_TEST_ROOT: root, ...extra },
  });
  return { root, run };
}

it('stops bootstrap on an installed old Node 22 before changing host packages or services', () => {
  const { root, run } = bootstrapFixture();
  const result = run();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Node 22.0.0 does not meet 22.23.4');
  expect(existsSync(join(root, 'host-mutated'))).toBe(false);
});

it('does not allow an environment override to install an unreviewed Node version', () => {
  const { root, run } = bootstrapFixture();
  const result = run({ NODE_VERSION: '22.0.0' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('reviewed mise.toml Node pin');
  expect(existsSync(join(root, 'host-mutated'))).toBe(false);
});

it('rejects a malformed or duplicate Node pin before provisioning', () => {
  const { root, run } = bootstrapFixture();
  writeFileSync(join(root, 'mise.toml'), '[tools]\nnode = "22.23.4"\nnode = "22.0.0"\n');
  expect(run().status).not.toBe(0);
  expect(existsSync(join(root, 'host-mutated'))).toBe(false);
});

it('keeps both deployment scripts valid Bash after runtime preflight changes', () => {
  for (const file of ['lightsail-bootstrap.sh', 'lightsail-staging.sh', 'lightsail-deploy.sh', 'download-verified.sh']) {
    expect(() => execFileSync('bash', ['-n', resolve('scripts/deploy', file)])).not.toThrow();
  }
  expect(readFileSync(resolve('scripts/deploy/lightsail-staging.sh'), 'utf8')).not.toMatch(/^\s*(?:NODE_ENV=production )?node /m);
});

it.each(['old pnpm', 'old Node', 'matching versions'])('checks production deployment tools before install: %s', scenario => {
  const root = mkdtempSync(join(tmpdir(), 'production-runtime-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts/deploy'), { recursive: true });
  mkdirSync(join(root, 'bin'));
  copyFileSync(resolve('scripts/deploy/lightsail-deploy.sh'), join(root, 'scripts/deploy/lightsail-deploy.sh'));
  copyFileSync(resolve('scripts/deploy/node-runtime.cjs'), join(root, 'scripts/deploy/node-runtime.cjs'));
  const [major, minor] = process.versions.node.split('.').map(Number);
  const pin = scenario === 'old Node' ? `${major}.${minor + 1}.0` : process.versions.node;
  writeFileSync(join(root, 'mise.toml'), `[tools]\nnode = "${pin}"\n`);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.34.9' }));
  writeFileSync(join(root, '.env.production'), 'APP_ENV=production\n');
  writeFileSync(join(root, 'bin/git'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(root, 'bin/pnpm'), `#!/bin/bash
if [ "$1" = --version ]; then
  touch "$DEPLOY_TEST_ROOT/version-checked"
  printf '%s\\n' '${scenario === 'old pnpm' ? '9.15.9' : '10.34.9'}'
else
  touch "$DEPLOY_TEST_ROOT/install-started"
  exit 78
fi
`, { mode: 0o755 });
  const result = spawnSync('bash', [join(root, 'scripts/deploy/lightsail-deploy.sh')], {
    encoding: 'utf8', env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, DEPLOY_TEST_ROOT: root },
  });
  if (scenario === 'matching versions') {
    expect(result.status, result.stderr).toBe(78);
    expect(existsSync(join(root, 'install-started'))).toBe(true);
  } else {
    expect(result.status).not.toBe(0);
    expect(existsSync(join(root, 'install-started'))).toBe(false);
    expect(result.stderr).toContain(scenario === 'old Node' ? 'does not meet' : 'does not match packageManager');
  }
  expect(existsSync(join(root, 'version-checked'))).toBe(scenario !== 'old Node');
});
