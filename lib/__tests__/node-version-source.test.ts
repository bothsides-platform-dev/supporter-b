// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// .nvmrc is the Node version source: CI reads it through setup-node and local
// shells through mise, and the pins that cannot read it (perf container, server
// bootstrap) must match it. engine-strict=true makes pnpm refuse anything below
// the package.json engines floor, which is kept at the pin.
describe('node version source', () => {
  const nvmrc = readFileSync(resolve('.nvmrc'), 'utf8').trim();

  it('has mise read the version from .nvmrc instead of repeating it', () => {
    const mise = readFileSync(resolve('mise.toml'), 'utf8');
    const node = mise.match(/^node\s*=\s*"(.*)"\s*$/m)?.[1];
    expect(node).toMatch(/read_file\(path='\.nvmrc'\)/);
    expect(node).not.toMatch(/\d+\.\d+/);
    // Added by the gstack /ship test coverage audit.
    // Value: protects=mise accepting the .nvmrc pin even though the file ends
    //   in a newline; fails_when=`| trim` is dropped from mise.toml (observed
    //   with mise 2026.10.18: `invalid tool version "22.23.4\n": contains
    //   forbidden character '\n'` in every local shell, while CI never runs
    //   mise and stays green); why_new=the read_file assertion above passes
    //   without the filter; seam=none; no_claim=that mise renders the template
    //   (text read only; mise is not installed in CI)
    expect(
      node,
      'mise rejects the trailing newline of .nvmrc unless the template trims it',
    ).toMatch(/read_file\(path='\.nvmrc'\)\s*\|\s*trim\b/);
  });

  it('keeps the package.json engines floor at the .nvmrc pin', () => {
    expect(nvmrc).toMatch(/^\d+\.\d+\.\d+$/);
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    expect(pkg.engines.node, 'bump .nvmrc and engines together').toBe(
      `^${nvmrc}`,
    );
  });

  it('keeps the perf container and server bootstrap on the .nvmrc pin', () => {
    const perf = readFileSync(resolve('.github/workflows/perf.yml'), 'utf8');
    expect(perf.match(/image:\s*node:(\d+\.\d+\.\d+)-/)?.[1]).toBe(nvmrc);
    const bootstrap = readFileSync(
      resolve('scripts/deploy/lightsail-bootstrap.sh'),
      'utf8',
    );
    expect(
      bootstrap.match(/NODE_VERSION="\$\{NODE_VERSION:-(\d+\.\d+\.\d+)\}"/)?.[1],
    ).toBe(nvmrc);
  });
});
