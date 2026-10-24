import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  it('checks the fetched upstream revision and fast-forwards to exactly it', () => {
    const order = [
      'git fetch --quiet',
      `TARGET_REV="$(git rev-parse '@{upstream}')"`,
      'check_node_for_rev "$TARGET_REV"',
      'git merge --ff-only "$TARGET_REV"',
    ].map((step) => deployScript.indexOf(step));
    expect(order.every((index) => index > -1), String(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(deployScript).not.toMatch(/git pull/);
  });

  it('compares Centrifugo config with the revision it last applied', () => {
    expect(deployScript).toMatch(
      /CENTRIFUGO_REV_FILE="\$\(git rev-parse --git-path centrifugo-config-rev\)"/,
    );
    expect(deployScript).toMatch(
      /git diff --quiet "\$CENTRIFUGO_REV" HEAD -- deploy\/centrifugo\/config\.yaml/,
    );
    const write = deployScript.indexOf('git rev-parse HEAD > "$CENTRIFUGO_REV_FILE"');
    expect(write).toBeGreaterThan(deployScript.indexOf('restart centrifugo'));
    expect(write).toBeLessThan(deployScript.indexOf('log "Building"'));
    expect(deployScript).not.toMatch(/rm -f "\$CENTRIFUGO_REV_FILE"/);
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
