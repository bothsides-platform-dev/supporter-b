import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The Lightsail scripts read the Node pin from mise.toml through
// scripts/deploy/node-version.sh. engine-strict=true stops `pnpm install` on a
// server below the pin, so the deploy checks the incoming pin BEFORE
// `git pull`: a failed pull-then-install used to leave HEAD advanced, and the
// retry then compared Centrifugo config against the new HEAD and skipped the
// restart the release needed.

function path(relFromHere: string): string {
  return fileURLToPath(new URL(relFromHere, import.meta.url));
}

const helper = path('../../scripts/deploy/node-version.sh');
const deployScript = readFileSync(
  path('../../scripts/deploy/lightsail-deploy.sh'),
  'utf8',
);
const bootstrap = readFileSync(
  path('../../scripts/deploy/lightsail-bootstrap.sh'),
  'utf8',
);

function run(snippet: string, input?: string): { code: number; out: string } {
  try {
    const out = execFileSync('bash', ['-c', `. "$0"; ${snippet}`, helper], {
      input,
      encoding: 'utf8',
    });
    return { code: 0, out: out.trim() };
  } catch (error) {
    return { code: (error as { status: number }).status, out: '' };
  }
}

describe('scripts/deploy/node-version.sh', () => {
  it('reads the pin from mise.toml on stdin', () => {
    const mise = readFileSync(path('../../mise.toml'), 'utf8');
    const pin = mise.match(/^node\s*=\s*"(\d+\.\d+\.\d+)"/m)?.[1];
    expect(run('pinned_node_version', mise)).toEqual({ code: 0, out: pin });
  });

  it('fails when mise.toml has no node pin', () => {
    expect(run('pinned_node_version', '[tools]\n').code).not.toBe(0);
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
    expect(run(`node_satisfies_pin "${have}" "${want}"`).code).toBe(code);
  });
});

describe('lightsail-deploy.sh Node gate', () => {
  it('checks the incoming pin before git pull moves HEAD', () => {
    const check = deployScript.indexOf('node_satisfies_pin');
    const pull = deployScript.indexOf('git pull --ff-only');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(pull);
  });

  it('keeps the starting revision until a deploy completes', () => {
    expect(deployScript).toMatch(/git rev-parse --git-path deploy-previous-rev/);
    const clear = deployScript.lastIndexOf('rm -f "$REV_STATE"');
    expect(clear).toBeGreaterThan(deployScript.indexOf('pm2 save'));
  });
});

describe('lightsail-bootstrap.sh Node install', () => {
  it('defaults to the mise.toml pin instead of a literal version', () => {
    expect(bootstrap).not.toMatch(/NODE_VERSION:-\d/);
    expect(bootstrap).toMatch(/pinned_node_version < "\$REPO_ROOT\/mise\.toml"/);
  });

  it('upgrades a server below the pin, not only a different major', () => {
    expect(bootstrap).toMatch(/node_satisfies_pin "\$\(node -v/);
    expect(bootstrap).not.toMatch(/cut -d\. -f1\)" != "v22"/);
  });
});
