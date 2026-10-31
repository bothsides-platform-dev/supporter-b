// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const temp = mkdtempSync(join(tmpdir(), 'staging-release-'));
  roots.push(temp);
  const root = join(temp, 'app'); const bin = join(temp, 'bin');
  const sha = 'a'.repeat(40); const releaseId = `${sha}-42-1`; const schema = 'b'.repeat(64);
  mkdirSync(bin); mkdirSync(join(root, 'incoming'), { recursive: true }); mkdirSync(join(root, 'shared'));
  writeFileSync(join(root, 'shared/.env.production'), 'APP_ENV=staging\nAPP_DOMAIN=dev.support-b.com\n');
  writeFileSync(join(root, 'shared/schema-ready'), `${schema}\n`);
  const put = (path: string, value: string) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, value); };
  const candidate = join(temp, 'candidate'); mkdirSync(candidate);
  put(join(candidate, '.release.json'), JSON.stringify({ sha, releaseId, schema, runNumber: 42 }));
  put(join(candidate, 'server.js'), 'setInterval(() => {}, 1000);');
  put(join(candidate, '.next/BUILD_ID'), sha);
  put(join(candidate, '.ops/check.cjs'), 'process.exit(0);');
  put(join(candidate, '.ops/sync.cjs'), 'process.exit(0);');
  put(join(candidate, '.ops/docker-compose.yml'), 'services: {}');
  const archive = join(root, 'incoming', `${releaseId}.tar.gz`);
  const repack = () => { execFileSync('tar', ['-czf', archive, '-C', candidate, '.']); return createHash('sha256').update(readFileSync(archive)).digest('hex'); };
  for (const command of ['flock', 'docker', 'curl']) writeFileSync(join(bin, command), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(bin, 'sudo'), '#!/bin/bash\nexec "$@"\n', { mode: 0o755 });
  writeFileSync(join(bin, 'systemctl'), '#!/bin/bash\nreadlink "$STAGING_TEST_ROOT/current" > "$STAGING_TEST_ROOT/running"\n', { mode: 0o755 });
  // Any accidental server-side source build/install/fetch is an error.
  for (const command of ['pnpm', 'npm', 'git']) writeFileSync(join(bin, command), '#!/bin/bash\nexit 79\n', { mode: 0o755 });
  const run = (digest = repack()) => spawnSync('bash', [resolve('scripts/deploy/lightsail-staging.sh'), root, releaseId, digest], {
    encoding: 'utf8', timeout: 15_000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STAGING_TEST_ROOT: root },
  });
  const previous = () => {
    const id = `${'c'.repeat(40)}-41-1`; const dir = join(root, 'releases', id);
    put(join(dir, '.release.json'), JSON.stringify({ sha: 'c'.repeat(40), releaseId: id, schema, runNumber: 41 }));
    put(join(dir, '.ops/docker-compose.yml'), 'services: {}');
    symlinkSync(`releases/${id}`, join(root, 'current'));
    return id;
  };
  return { root, bin, sha, releaseId, schema, run, repack, previous, candidate };
}

it('activates a checked artifact without fetching source, installing dependencies or building on the server', () => {
  const { root, releaseId, run } = fixture();
  const result = run();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(readlinkSync(join(root, 'current'))).toBe(`releases/${releaseId}`);
  expect(readFileSync(join(root, 'running'), 'utf8').trim()).toBe(`releases/${releaseId}`);
});

it('rejects an archive whose digest does not match CI without changing the current release', () => {
  const { root, run, repack, previous } = fixture();
  const old = previous(); repack();
  const result = run('0'.repeat(64));
  expect(result.status).not.toBe(0);
  expect(readlinkSync(join(root, 'current'))).toBe(`releases/${old}`);
  expect(existsSync(join(root, 'running'))).toBe(false);
});

it('restores the previous release when the activated app fails its HTTP check', () => {
  const { root, bin, run, previous, releaseId } = fixture();
  const old = previous();
  writeFileSync(join(bin, 'curl'), `#!/bin/bash
if [ "$(readlink "$STAGING_TEST_ROOT/current")" = "releases/${releaseId}" ]; then exit 22; fi
`, { mode: 0o755 });
  const result = run();
  expect(result.status).not.toBe(0);
  expect(readlinkSync(join(root, 'current'))).toBe(`releases/${old}`);
  expect(readFileSync(join(root, 'running'), 'utf8').trim()).toBe(`releases/${old}`);
  expect(result.stderr).toContain('Rolled back');
});

it.each(['production environment', 'wrong build', 'unapplied schema', 'concurrent deployment'])(
  'rejects %s before activating the artifact', (scenario) => {
    const { root, bin, candidate, run, previous } = fixture();
    const old = previous();
    if (scenario === 'production environment') writeFileSync(join(root, 'shared/.env.production'), 'APP_ENV=production\nAPP_DOMAIN=support-b.com\n');
    if (scenario === 'wrong build') writeFileSync(join(candidate, '.next/BUILD_ID'), 'another-build');
    if (scenario === 'unapplied schema') {
      rmSync(join(root, 'shared/schema-ready'));
      const path = join(root, 'current/.release.json');
      writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), schema: 'd'.repeat(64) }));
    }
    if (scenario === 'concurrent deployment') writeFileSync(join(bin, 'flock'), '#!/bin/bash\nexit 1\n', { mode: 0o755 });
    const result = run();
    expect(result.status).not.toBe(0);
    expect(readlinkSync(join(root, 'current'))).toBe(`releases/${old}`);
    expect(existsSync(join(root, 'running'))).toBe(false);
  },
);

it('leaves the running version untouched when the candidate cannot start on its test port', () => {
  const { root, bin, run, previous } = fixture();
  const old = previous();
  writeFileSync(join(bin, 'curl'), '#!/bin/bash\ncase "$*" in *:3100/*) exit 22;; esac\n', { mode: 0o755 });
  const result = run();
  expect(result.status).not.toBe(0);
  expect(readlinkSync(join(root, 'current'))).toBe(`releases/${old}`);
  expect(existsSync(join(root, 'running'))).toBe(false);
});

it('skips a superseded run and never overwrites an already deployed release on replay', () => {
  const { root, candidate, run, repack, previous, releaseId } = fixture();
  const old = previous();
  const path = join(root, 'current/.release.json');
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), runNumber: 43 }));
  const digest = repack();
  expect(run(digest).status).toBe(0);
  expect(readlinkSync(join(root, 'current'))).toBe(`releases/${old}`);
  expect(existsSync(join(root, 'running'))).toBe(false);
  rmSync(join(root, 'current'));
  expect(run(digest).status).toBe(0);
  writeFileSync(join(candidate, 'server.js'), 'throw new Error("modified release");');
  expect(run().status).not.toBe(0);
  expect(readFileSync(join(root, 'releases', releaseId, 'server.js'), 'utf8')).toBe('setInterval(() => {}, 1000);');
});

it('bounds retained releases without deleting the previous version or shared configuration', () => {
  const { root, run, previous, releaseId } = fixture();
  const old = previous();
  for (let index = 1; index <= 8; index++) {
    const dir = join(root, 'releases', `${'d'.repeat(40)}-${index}-1`);
    mkdirSync(dir); utimesSync(dir, index, index);
  }
  expect(run().status).toBe(0);
  expect(readdirSync(join(root, 'releases'))).toHaveLength(5);
  expect(existsSync(join(root, 'releases', old))).toBe(true);
  expect(existsSync(join(root, 'shared/.env.production'))).toBe(true);
  expect(existsSync(join(root, 'incoming', `${releaseId}.tar.gz`))).toBe(false);
});
