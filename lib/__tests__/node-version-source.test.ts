// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// mise.toml is the only Node version file: local shells read it through mise
// and CI through setup-node's node-version-file. Bootstrap also reads it before
// installing Node; the perf container keeps a matching pin. engine-strict=true
// makes pnpm refuse anything below the package.json engines floor, which is
// kept at the pin.
const read = (path: string) => readFileSync(resolve(path), 'utf8');

describe('node version source', () => {
  const mise = read('mise.toml');
  const pin = mise.match(/^node\s*=\s*"(\d+\.\d+\.\d+)"\s*$/m)?.[1];

  it('pins an exact Node version in mise.toml and nothing else', () => {
    expect(pin, 'mise.toml needs node = "x.y.z" under [tools]').toMatch(
      /^\d+\.\d+\.\d+$/,
    );
    // A plain tool version resolves without `mise trust`. Templates, [env]
    // and hooks can run commands, so mise asks for trust first, and a
    // worktree nobody trusted falls back to the system Node after one warning.
    const entries = mise
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    expect(entries, 'keep mise.toml trust-free').toEqual([
      '[tools]',
      `node = "${pin}"`,
    ]);
  });

  it('has no second Node version file', () => {
    for (const file of ['.nvmrc', '.node-version', '.tool-versions']) {
      expect(existsSync(resolve(file)), file).toBe(false);
    }
  });

  it('keeps the package.json engines floor at the mise.toml pin', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.engines.node, 'bump mise.toml and engines together').toBe(
      `^${pin}`,
    );
  });

  it('has every CI setup-node step read mise.toml', () => {
    const ci = read('.github/workflows/ci.yml');
    const majors = [...ci.matchAll(/uses: actions\/setup-node@(?:v(\d+)|[0-9a-f]{40}[ \t]+#[ \t]*v(\d+))/g)].map(
      (match) => Number(match[1] ?? match[2]),
    );
    expect(majors.length).toBeGreaterThan(0);
    // setup-node reads mise.toml from 7.1.0.
    for (const major of majors) expect(major).toBeGreaterThanOrEqual(7);
    expect(ci.match(/node-version-file: mise\.toml/g)?.length).toBe(
      majors.length,
    );
    expect(ci).not.toMatch(/^\s*node-version:/m);
  });

  it('keeps the perf container pinned and makes bootstrap read mise.toml', () => {
    const perf = read('.github/workflows/perf.yml');
    expect(
      perf.match(/image:\s*node:(\d+\.\d+\.\d+)-/)?.[1],
      'perf.yml runs pnpm install under engine-strict',
    ).toBe(pin);
    const bootstrap = read('scripts/deploy/lightsail-bootstrap.sh');
    expect(bootstrap).toContain('"$REPO_ROOT/mise.toml"');
    expect(bootstrap).toContain('NODE_VERSION="${NODE_VERSION:-$NODE_PIN}"');
    expect(bootstrap).toContain('node-runtime.cjs" check "$NODE_PIN"');
    expect(read('scripts/deploy/release-checksums.txt')).toContain(`node-v${pin}-linux-x64.tar.xz`);
  });
});
