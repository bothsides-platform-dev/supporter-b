// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// .nvmrc is the single Node version source: CI reads it through setup-node and
// local shells through mise. engine-strict=true makes pnpm refuse any other
// version, so the pin must also satisfy package.json engines.
describe('node version source', () => {
  const nvmrc = readFileSync(resolve('.nvmrc'), 'utf8').trim();

  it('has mise read the version from .nvmrc instead of repeating it', () => {
    const mise = readFileSync(resolve('mise.toml'), 'utf8');
    const node = mise.match(/^node\s*=\s*"(.*)"\s*$/m)?.[1];
    expect(node).toMatch(/read_file\(path='\.nvmrc'\)/);
    expect(node).not.toMatch(/\d+\.\d+/);
  });

  it('pins a version that package.json engines accepts', () => {
    expect(nvmrc).toMatch(/^\d+\.\d+\.\d+$/);
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    expect(pkg.engines.node).toBe(`^${nvmrc}`);
  });
});
