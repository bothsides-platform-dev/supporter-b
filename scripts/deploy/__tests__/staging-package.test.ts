// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'staging-package-'));
  roots.push(root);
  const put = (path: string, text: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put('.gitignore', '.next/\n.staging-ops/\noutput/\n');
  put('lib/db/schema/example.ts', 'export const version = 1;');
  put('docker-compose.prod.yml', 'services: {}\n');
  put('deploy/centrifugo/config.yaml', 'test: true\n');
  put('public/example.txt', 'public asset');
  put('assets/fonts/example.ttf', 'font');
  put('.next/standalone/server.js', 'built server');
  put('.next/standalone/.next/BUILD_ID', 'built-id');
  put('.next/standalone/.env.production', 'AUTH_SECRET=must-not-ship');
  put('.next/static/app.js', 'built client');
  put('.staging-ops/check.cjs', 'compiled check');
  put('.staging-ops/sync.cjs', 'compiled sync');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'dev');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  git('add', '.'); git('commit', '-m', 'fixture');
  const sha = git('rev-parse', 'HEAD');
  put('.next/standalone/.next/BUILD_ID', sha);
  const run = (revision = sha) => spawnSync(process.execPath, [resolve('scripts/deploy/package-staging.mjs'), join(root, 'output'), revision, '42', '1'], { cwd: root, encoding: 'utf8' });
  return { root, sha, run, put };
}

it('packages the standalone runtime, static assets and compiled operations without environment secrets', () => {
  const { root, sha, run } = fixture();
  const result = run();
  expect(result.status, result.stderr).toBe(0);
  const release = JSON.parse(readFileSync(join(root, 'output/release.json'), 'utf8'));
  const archive = join(root, 'output', release.archive);
  expect(release).toMatchObject({ sha, releaseId: `${sha}-42-1`, runNumber: 42 });
  expect(createHash('sha256').update(readFileSync(archive)).digest('hex')).toBe(release.digest);
  const unpacked = join(root, 'unpacked'); mkdirSync(unpacked);
  execFileSync('tar', ['-xzf', archive, '-C', unpacked]);
  expect(readFileSync(join(unpacked, 'server.js'), 'utf8')).toBe('built server');
  expect(readFileSync(join(unpacked, 'public/example.txt'), 'utf8')).toBe('public asset');
  expect(readFileSync(join(unpacked, '.next/static/app.js'), 'utf8')).toBe('built client');
  expect(readFileSync(join(unpacked, '.ops/check.cjs'), 'utf8')).toBe('compiled check');
  expect(existsSync(join(unpacked, '.env.production'))).toBe(false);
  expect(JSON.parse(readFileSync(join(unpacked, '.release.json'), 'utf8'))).toMatchObject({ sha, schema: expect.stringMatching(/^[0-9a-f]{64}$/) });
});

it('keeps runtime dependency symlinks portable after the build machine is removed', () => {
  const { root, run, put } = fixture();
  put('.next/standalone/node_modules/.pnpm/example/index.js', 'runtime dependency');
  symlinkSync('.pnpm/example', join(root, '.next/standalone/node_modules/example'));
  expect(run().status).toBe(0);
  const release = JSON.parse(readFileSync(join(root, 'output/release.json'), 'utf8'));
  const unpacked = join(root, 'unpacked'); mkdirSync(unpacked);
  execFileSync('tar', ['-xzf', join(root, 'output', release.archive), '-C', unpacked]);
  rmSync(join(root, '.next'), { recursive: true });
  expect(readlinkSync(join(unpacked, 'node_modules/example'))).toBe('.pnpm/example');
  expect(readFileSync(join(unpacked, 'node_modules/example/index.js'), 'utf8')).toBe('runtime dependency');
});

it('ships dependencies used only by the compiled maintenance commands', () => {
  const { root, run, put } = fixture();
  put('node_modules/.pnpm/ops-only/node_modules/ops-only/package.json', JSON.stringify({ name: 'ops-only', main: 'index.js' }));
  put('node_modules/.pnpm/ops-only/node_modules/ops-only/index.js', 'module.exports = "maintenance ready";');
  symlinkSync('.pnpm/ops-only/node_modules/ops-only', join(root, 'node_modules/ops-only'));
  put('.staging-ops/check.cjs', 'console.log(require("ops-only"));');
  expect(run().status).toBe(0);
  const release = JSON.parse(readFileSync(join(root, 'output/release.json'), 'utf8'));
  const unpacked = join(root, 'unpacked'); mkdirSync(unpacked);
  execFileSync('tar', ['-xzf', join(root, 'output', release.archive), '-C', unpacked]);
  rmSync(join(root, 'node_modules'), { recursive: true });
  const check = spawnSync(process.execPath, ['.ops/check.cjs'], { cwd: unpacked, encoding: 'utf8' });
  expect(check.status, check.stderr).toBe(0);
  expect(check.stdout.trim()).toBe('maintenance ready');
});

it('refuses to label a build with another commit or package a build from another revision', () => {
  const { run, put } = fixture();
  expect(run('a'.repeat(40)).status).not.toBe(0);
  put('.next/standalone/.next/BUILD_ID', 'old-build');
  expect(run().status).not.toBe(0);
});
