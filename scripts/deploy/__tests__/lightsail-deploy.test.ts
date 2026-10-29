// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'staging-deploy-'));
  roots.push(root);
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  mkdirSync(repo);
  mkdirSync(bin);
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'dev');
  git('config', 'user.email', 'deploy@example.invalid');
  git('config', 'user.name', 'Deploy test');
  mkdirSync(join(repo, 'scripts/deploy'), { recursive: true });
  copyFileSync(resolve('scripts/deploy/lightsail-deploy.sh'), join(repo, 'scripts/deploy/lightsail-deploy.sh'));
  writeFileSync(join(repo, '.gitignore'), '.env.production\n');
  git('add', '.');
  git('commit', '-m', 'initial');
  const first = git('rev-parse', 'HEAD');
  git('clone', '--bare', repo, join(root, 'origin.git'));
  git('remote', 'add', 'origin', join(root, 'origin.git'));
  git('fetch', 'origin');
  git('branch', '--set-upstream-to=origin/dev', 'dev');
  writeFileSync(join(repo, 'change.txt'), 'new, not yet checked\n');
  git('add', '.');
  git('commit', '-m', 'newer');
  const latest = git('rev-parse', 'HEAD');
  git('push', 'origin', 'dev');
  git('reset', '--hard', first);
  writeFileSync(join(repo, '.env.production'), 'POSTGRES_USER=test\nAPP_ENV=staging\nAPP_DOMAIN=dev.support-b.com\n');
  writeFileSync(join(bin, 'pnpm'), '#!/bin/bash\nif [ "$1" = build ]; then git rev-parse HEAD > "$DEPLOY_TEST_BUILT"; fi\n', { mode: 0o755 });
  for (const command of ['docker', 'node', 'pm2', 'flock', 'curl']) {
    writeFileSync(join(bin, command), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  }
  const built = join(root, 'built');
  const run = (extra: Record<string, string> = {}) => spawnSync('bash', ['scripts/deploy/lightsail-deploy.sh'], {
    cwd: repo, encoding: 'utf8', env: { ...env, PATH: `${bin}:${process.env.PATH}`, DEPLOY_TEST_BUILT: built, ...extra },
  });
  const staging = (sha: string) => spawnSync('bash', [resolve('scripts/deploy/lightsail-staging.sh'), repo, sha], {
    encoding: 'utf8', input: 'fixture-read-token\n', env: { ...env, PATH: `${bin}:${process.env.PATH}`, DEPLOY_TEST_BUILT: built },
  });
  return { run, staging, first, latest, built, git, repo, bin };
}

it('builds the checked commit without pulling a newer unverified dev commit', () => {
  const { run, first, built } = fixture();
  const result = run({ DEPLOY_COMMIT: first });
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(built, 'utf8').trim()).toBe(first);
});

it('updates the staging checkout to the verified dev tip and builds that revision', () => {
  const { staging, latest, built } = fixture();
  const result = staging(latest);
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(built, 'utf8').trim()).toBe(latest);
});

it('rejects a commit that is not the checked out revision before building', () => {
  const { run, latest, built } = fixture();
  const result = run({ DEPLOY_COMMIT: latest });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('DEPLOY_COMMIT must match HEAD');
  expect(existsSync(built)).toBe(false);
});

it('skips a completed CI run when dev has moved on, without changing the checkout', () => {
  const { staging, first, built, git } = fixture();
  const result = staging(first);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('Skipping superseded');
  expect(existsSync(built)).toBe(false);
  expect(git('rev-parse', 'HEAD')).toBe(first);
});

it.each(['production config', 'dirty checkout', 'concurrent deployment', 'invalid revision'])(
  'rejects %s before updating or building staging', (scenario) => {
    const { staging, first, latest, built, git, repo, bin } = fixture();
    if (scenario === 'production config') writeFileSync(join(repo, '.env.production'), 'APP_ENV=production\nAPP_DOMAIN=support-b.com\n');
    if (scenario === 'dirty checkout') writeFileSync(join(repo, '.gitignore'), 'user edit\n');
    if (scenario === 'concurrent deployment') writeFileSync(join(bin, 'flock'), '#!/bin/bash\nexit 1\n', { mode: 0o755 });
    const result = staging(scenario === 'invalid revision' ? 'dev' : latest);
    expect(result.status).not.toBe(0);
    expect(existsSync(built)).toBe(false);
    expect(git('rev-parse', 'HEAD')).toBe(first);
  },
);

it.each(['scripts/migrations', 'scripts/sql'])('requires a schema-ready receipt when %s changes', (migrationDir) => {
  const { staging, latest, built, git, repo } = fixture();
  expect(staging(latest).status).toBe(0);
  rmSync(built);
  git('switch', 'dev');
  git('merge', '--ff-only', 'origin/dev');
  mkdirSync(join(repo, migrationDir), { recursive: true });
  writeFileSync(join(repo, migrationDir, 'new.sql'), 'ALTER TABLE example ADD COLUMN label text;\n');
  git('add', '.');
  git('commit', '-m', 'new schema');
  const target = git('rev-parse', 'HEAD');
  git('push', 'origin', 'dev');
  git('checkout', '--detach', latest);

  const blocked = staging(target);
  expect(blocked.status).not.toBe(0);
  expect(blocked.stderr).toContain('staging-schema-ready');
  expect(existsSync(built)).toBe(false);

  writeFileSync(join(repo, git('rev-parse', '--git-path', 'staging-schema-ready')), `${target}\n`);
  const deployed = staging(target);
  expect(deployed.status, deployed.stderr).toBe(0);
  expect(readFileSync(built, 'utf8').trim()).toBe(target);
});

it('does not record a successful deployment when the restarted app fails its HTTP check', () => {
  const { staging, first, latest, repo, bin } = fixture();
  writeFileSync(join(bin, 'curl'), '#!/bin/bash\nexit 22\n', { mode: 0o755 });
  const result = staging(latest);
  expect(result.status).not.toBe(0);
  expect(readFileSync(join(repo, '.git/staging-deployed'), 'utf8').trim()).toBe(first);
});

it('keeps the deployment lock out of app/build child processes so it can be released', () => {
  const { staging, latest, bin } = fixture();
  writeFileSync(join(bin, 'pnpm'), '#!/bin/bash\nif { true >&9; } 2>/dev/null; then exit 66; fi\n', { mode: 0o755 });
  const result = staging(latest);
  expect(result.status, result.stderr).toBe(0);
});

it('authenticates only the fetch with the stdin token without persisting credentials or passing them to app children', () => {
  const { staging, latest, bin, repo, git } = fixture();
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  writeFileSync(join(bin, 'git'), `#!/bin/bash
if [ "$1" = fetch ]; then
  [ "$GIT_CONFIG_COUNT" = 1 ] || exit 70
  [ "$GIT_CONFIG_KEY_0" = http.https://github.com/bothsides-platform-dev/supporter-b.git.extraheader ] || exit 71
  [ "$GIT_CONFIG_VALUE_0" = 'AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46Zml4dHVyZS1yZWFkLXRva2Vu' ] || exit 72
fi
exec '${realGit}' "$@"
`, { mode: 0o755 });
  writeFileSync(join(bin, 'pnpm'), `#!/bin/bash
if env | grep -Eq 'fixture-read-token|eC1hY2Nlc3MtdG9rZW46Zml4dHVyZS1yZWFkLXRva2Vu'; then exit 73; fi
`, { mode: 0o755 });
  const result = staging(latest);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout + result.stderr).not.toContain('fixture-read-token');
  expect(readFileSync(join(repo, '.git/config'), 'utf8')).not.toContain('extraheader');
  expect(git('rev-parse', 'HEAD')).toBe(latest);
});
