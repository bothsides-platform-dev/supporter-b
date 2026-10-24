import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

// The Lightsail scripts read the Node pin from mise.toml through
// scripts/deploy/node-version.sh. engine-strict=true stops `pnpm install` on a
// server whose Node does not satisfy the pin, so the deploy checks the pin of
// the exact revision it is about to fast-forward to BEFORE moving HEAD (a
// failed pull-then-install used to leave HEAD advanced). Node itself is
// changed only through scripts/deploy/install-node.sh, never the full
// bootstrap, which also runs `dnf update` and rewrites Caddy on a live box.

function path(relFromHere: string): string {
  return fileURLToPath(new URL(relFromHere, import.meta.url));
}

const helper = path('../../scripts/deploy/node-version.sh');
const installNode = path('../../scripts/deploy/install-node.sh');
const pin = readFileSync(path('../../mise.toml'), 'utf8').match(
  /^node\s*=\s*"(\d+\.\d+\.\d+)"/m,
)?.[1];
const deployScript = readFileSync(
  path('../../scripts/deploy/lightsail-deploy.sh'),
  'utf8',
);
const bootstrap = readFileSync(
  path('../../scripts/deploy/lightsail-bootstrap.sh'),
  'utf8',
);

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'node-version-'));
  temps.push(dir);
  return dir;
}

// Executables named after real commands, put first on PATH.
function stubs(bodies: Record<string, string>): string {
  const bin = tempDir();
  for (const [name, body] of Object.entries(bodies)) {
    writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return bin;
}

function bash(
  args: string[],
  opts: { cwd?: string; bin?: string; input?: string; env?: Record<string, string> } = {},
): { code: number | null; out: string; err: string } {
  const result = spawnSync('bash', args, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...opts.env,
      PATH: opts.bin ? `${opts.bin}:${process.env.PATH}` : process.env.PATH,
    },
  });
  return { code: result.status, out: result.stdout.trim(), err: result.stderr };
}

function helperRun(snippet: string, opts: Parameters<typeof bash>[1] = {}) {
  return bash(['-c', `. "$0"; ${snippet}`, helper], opts);
}

function commitRepo(files: Record<string, string>): string {
  const dir = tempDir();
  const git = (...args: string[]) =>
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
    });
  git('init', '-q');
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  return dir;
}

describe('scripts/deploy/node-version.sh', () => {
  it('reads the pin from mise.toml on stdin', () => {
    const mise = readFileSync(path('../../mise.toml'), 'utf8');
    expect(helperRun('pinned_node_version', { input: mise })).toMatchObject({
      code: 0,
      out: pin,
    });
  });

  it('fails when mise.toml has no node pin', () => {
    expect(helperRun('pinned_node_version', { input: '[tools]\n' }).code).not.toBe(0);
  });

  it.each([
    ['v22.23.4', '22.23.4', 0],
    ['v22.23.10', '22.23.4', 0],
    ['v22.24.0', '22.23.4', 0],
    ['v22.13.0', '22.23.4', 1],
    ['v22.23.3', '22.23.4', 1],
    ['v24.1.0', '22.23.4', 1],
    ['', '22.23.4', 1],
  ])('node %s against pin %s exits %i', (have, want, code) => {
    expect(helperRun(`node_satisfies_pin "${have}" "${want}"`).code).toBe(code);
  });

  it.each([
    ['22.23.4', 0],
    ['22.23', 1],
    ['v22.23.4', 1],
    ['22.23.4;id', 1],
    ['', 1],
  ])('treats %j as a Node version: exit %i', (value, code) => {
    expect(helperRun(`is_node_version "${value}"`).code).toBe(code);
  });
});

describe('check_node_for_rev', () => {
  const node = (version: string) => stubs({ node: `echo ${version}` });

  it('passes when node satisfies the pin at that revision', () => {
    const repo = commitRepo({ 'mise.toml': '[tools]\nnode = "22.23.4"\n' });
    const result = helperRun('check_node_for_rev HEAD', {
      cwd: repo,
      bin: node('v22.23.10'),
    });
    expect(result.code).toBe(0);
  });

  it('stops and points at install-node.sh when node is below the pin', () => {
    const repo = commitRepo({ 'mise.toml': '[tools]\nnode = "22.24.0"\n' });
    const result = helperRun('check_node_for_rev HEAD', {
      cwd: repo,
      bin: node('v22.23.4'),
    });
    expect(result.code).toBe(1);
    expect(result.err).toContain('install-node.sh 22.24.0');
  });

  it('stops when the revision has mise.toml without a pin', () => {
    const repo = commitRepo({ 'mise.toml': '[tools]\n' });
    expect(
      helperRun('check_node_for_rev HEAD', { cwd: repo, bin: node('v22.23.4') }).code,
    ).toBe(1);
  });

  it('lets a revision without mise.toml through with a warning (revert)', () => {
    const repo = commitRepo({ 'README.md': 'x\n' });
    const result = helperRun('check_node_for_rev HEAD', {
      cwd: repo,
      bin: node('v22.23.4'),
    });
    expect(result.code).toBe(0);
    expect(result.err).toContain('WARN');
  });
});

describe('scripts/deploy/install-node.sh', () => {
  const tarball = 'fake-tarball';
  const file = (version: string) => `node-v${version}-linux-x64.tar.xz`;
  const sums = (version: string, digest = createHash('sha256').update(tarball).digest('hex')) =>
    `${digest}  ${file(version)}\n`;

  function install(args: string[], current: string, shasums: string) {
    const log = join(tempDir(), 'log');
    writeFileSync(log, '');
    const bin = stubs({
      node: `echo ${current}`,
      sudo: 'echo "sudo $*" >> "$STUB_LOG"',
      curl: [
        'out=""; url=""',
        'while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -*) shift;; *) url="$1"; shift;; esac; done',
        'echo "curl $url" >> "$STUB_LOG"',
        'case "$url" in *SHASUMS256.txt) printf "%s" "$STUB_SHASUMS" > "$out";; *) printf "%s" "$STUB_TARBALL" > "$out";; esac',
      ].join('\n'),
    });
    const result = bash([installNode, ...args], {
      bin,
      env: { STUB_LOG: log, STUB_SHASUMS: shasums, STUB_TARBALL: tarball },
    });
    return { ...result, log: readFileSync(log, 'utf8') };
  }

  it('rejects a malformed version before downloading anything', () => {
    const result = install(['v22'], 'v22.23.4', '');
    expect(result.code).not.toBe(0);
    expect(result.log).toBe('');
  });

  it('does nothing when that exact version is installed', () => {
    const result = install(['22.23.4'], 'v22.23.4', '');
    expect(result.code).toBe(0);
    expect(result.log).toBe('');
  });

  it('defaults to the mise.toml pin', () => {
    const result = install([], `v${pin}`, '');
    expect(result.code).toBe(0);
    expect(result.log).toBe('');
  });

  it('refuses to unpack a tarball whose sha256 does not match', () => {
    const result = install(['22.23.4'], 'v22.13.0', sums('22.23.4', '0'.repeat(64)));
    expect(result.code).not.toBe(0);
    expect(result.log).not.toContain('sudo');
  });

  it('downloads, verifies and unpacks the requested version, including a downgrade', () => {
    const result = install(['22.23.4'], 'v22.24.0', sums('22.23.4'));
    expect(result.code).toBe(0);
    expect(result.log).toContain(
      `curl https://nodejs.org/dist/v22.23.4/${file('22.23.4')}`,
    );
    expect(result.log).toMatch(
      new RegExp(`sudo tar -xJf \\S+/${file('22.23.4')} -C /usr/local --strip-components=1`),
    );
  });
});

describe('lightsail-deploy.sh Node gate', () => {
  // A second fetch could fast-forward past the revision check_node_for_rev
  // approved. The behaviour tests below cannot move upstream mid-run.
  it('fast-forwards to the checked revision instead of pulling', () => {
    expect(deployScript).not.toMatch(/git pull/);
  });
});

// Value: protects=lightsail-deploy.sh stops before moving HEAD when the
//   server's Node does not satisfy the incoming mise.toml pin, and restarts
//   Centrifugo before the app whenever config.yaml differs from the revision
//   Centrifugo last loaded, including on a retry after a failed deploy;
//   fails_when=the Node check stops blocking (`|| echo WARN`) or runs after the
//   merge, node-version.sh is no longer sourced, or the Centrifugo baseline is
//   read after the merge, cleared, or written before the Centrifugo step;
//   why_new=the earlier guards read the script text and stayed green for those
//   changes; seam=none (the script cds to its own checkout, so a temp clone with
//   node/pnpm/docker/pm2 stubs runs it unchanged);
//   no_claim=real pnpm/docker/pm2/Node, the calendar step
//   (SKIP_CALENDAR_CHECK=1), upstream moving between fetch and merge, and a
//   failed first run on a server that has no baseline file yet.
describe('lightsail-deploy.sh behaviour', () => {
  // Ignore the developer's git config (hooks, signing, default branch).
  const gitEnv = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

  function git(cwd: string, ...args: string[]): string {
    const result = spawnSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      { cwd, encoding: 'utf8', env: { ...process.env, ...gitEnv } },
    );
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  }

  const mise = (version: string) => `[tools]\nnode = "${version}"\n`;

  // A server checkout of a first release (pin 22.23.4, Centrifugo config A)
  // tracking a bare origin that later releases are pushed to.
  function server() {
    const origin = tempDir();
    git(origin, 'init', '-q', '--bare');
    const seed = tempDir();
    git(seed, 'init', '-q');
    git(seed, 'remote', 'add', 'origin', origin);
    const publish = (files: Record<string, string>): string => {
      for (const [name, body] of Object.entries(files)) {
        mkdirSync(dirname(join(seed, name)), { recursive: true });
        writeFileSync(join(seed, name), body);
      }
      git(seed, 'add', '-A');
      git(seed, 'commit', '-q', '-m', 'release');
      git(seed, 'push', '-q', 'origin', 'HEAD:main');
      return git(seed, 'rev-parse', 'HEAD');
    };
    publish({
      'scripts/deploy/lightsail-deploy.sh': deployScript,
      'scripts/deploy/node-version.sh': readFileSync(helper, 'utf8'),
      'mise.toml': mise('22.23.4'),
      'deploy/centrifugo/config.yaml': 'A\n',
    });

    const dir = tempDir();
    git(dir, 'clone', '-q', '-b', 'main', origin, '.');
    writeFileSync(join(dir, '.env.production'), 'POSTGRES_USER=t\n');

    const log = join(tempDir(), 'log');
    const bin = stubs({
      node: '[ "$1" = -v ] && { echo "$STUB_NODE"; exit 0; }\necho "node $*" >> "$STUB_LOG"',
      pnpm: 'echo "pnpm $*" >> "$STUB_LOG"\n[ -z "$STUB_PNPM_FAIL" ]',
      docker: 'echo "docker $*" >> "$STUB_LOG"',
      pm2: 'echo "pm2 $*" >> "$STUB_LOG"',
    });
    const deploy = (node: string, env: Record<string, string> = {}) => {
      writeFileSync(log, '');
      const result = bash([join(dir, 'scripts/deploy/lightsail-deploy.sh')], {
        bin,
        env: {
          ...gitEnv,
          STUB_LOG: log,
          STUB_NODE: node,
          SKIP_CALENDAR_CHECK: '1',
          ...env,
        },
      });
      const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
      return { ...result, calls };
    };

    return {
      publish,
      deploy,
      head: () => git(dir, 'rev-parse', 'HEAD'),
      baseline: () =>
        readFileSync(join(dir, '.git', 'centrifugo-config-rev'), 'utf8').trim(),
    };
  }

  const restarts = (calls: string[]) =>
    calls.filter((call) => call.includes('restart centrifugo'));

  it('stops before moving HEAD when Node is below the incoming pin', () => {
    const box = server();
    const before = box.head();
    box.publish({ 'mise.toml': mise('22.24.0'), 'deploy/centrifugo/config.yaml': 'B\n' });

    const result = box.deploy('v22.23.4');

    expect(result.code).toBe(1);
    expect(result.err).toContain('install-node.sh 22.24.0');
    expect(box.head()).toBe(before);
    expect(result.calls.filter((call) => call.startsWith('pnpm'))).toEqual([]);
  });

  it('restarts changed Centrifugo config before the app on a first run', () => {
    const box = server();
    const target = box.publish({
      'mise.toml': mise('22.24.0'),
      'deploy/centrifugo/config.yaml': 'B\n',
    });

    const result = box.deploy('v22.24.0');

    expect(result.code, result.err).toBe(0);
    expect(box.head()).toBe(target);
    expect(restarts(result.calls)).toHaveLength(1);
    const restart = result.calls.findIndex((call) => call.includes('restart centrifugo'));
    const reload = result.calls.indexOf('pm2 reload ecosystem.config.cjs');
    expect(reload).toBeGreaterThan(restart);
    expect(box.baseline()).toBe(target);
  });

  it('still restarts Centrifugo on the retry after a deploy failed past the merge', () => {
    const box = server();
    box.publish({ 'deploy/centrifugo/config.yaml': 'B\n' });
    expect(box.deploy('v22.23.4').code).toBe(0);
    const target = box.publish({ 'deploy/centrifugo/config.yaml': 'C\n' });

    const failed = box.deploy('v22.23.4', { STUB_PNPM_FAIL: '1' });
    expect(failed.code).not.toBe(0);
    expect(box.head()).toBe(target);
    expect(restarts(failed.calls)).toEqual([]);

    const retry = box.deploy('v22.23.4');
    expect(retry.code, retry.err).toBe(0);
    expect(restarts(retry.calls)).toHaveLength(1);
    expect(box.baseline()).toBe(target);
  });
});

describe('lightsail-bootstrap.sh Node install', () => {
  it('installs through install-node.sh at the mise.toml pin', () => {
    expect(bootstrap).not.toMatch(/NODE_VERSION:-\d/);
    expect(bootstrap).toMatch(/pinned_node_version < "\$REPO_ROOT\/mise\.toml"/);
    expect(bootstrap).toMatch(/install-node\.sh" "\$NODE_VERSION"/);
    expect(bootstrap).not.toMatch(/nodejs\.org\/dist/);
  });

  it('upgrades a server below the pin, not only a different major', () => {
    expect(bootstrap).toMatch(/node_satisfies_pin "\$\(node -v/);
    expect(bootstrap).not.toMatch(/cut -d\. -f1\)" != "v22"/);
  });
});
