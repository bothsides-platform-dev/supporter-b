// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function fixture(algorithm: 'sha256' | 'sha512' = 'sha256') {
  const root = mkdtempSync(join(tmpdir(), 'verified-release-'));
  roots.push(root);
  mkdirSync(join(root, 'bin'));
  copyFileSync(resolve('scripts/deploy/download-verified.sh'), join(root, 'download-verified.sh'));
  const artifact = 'tool-1.2.3-linux-x64';
  const body = 'reviewed release bytes';
  const digest = createHash(algorithm).update(body).digest('hex');
  const manifest = `${algorithm} ${digest} ${artifact}\n`;
  writeFileSync(join(root, 'release-checksums.txt'), manifest);
  writeFileSync(join(root, 'payload'), body);
  writeFileSync(join(root, 'installed'), 'existing installation');
  writeFileSync(join(root, 'bin/curl'), `#!/bin/bash
touch "$DOWNLOAD_TEST_ROOT/fetched"
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then cp "$DOWNLOAD_TEST_ROOT/payload" "$2"; exit 0; fi
  shift
done
exit 79
`, { mode: 0o755 });
  const run = (url = 'https://nodejs.org/dist/v1.2.3/tool') => spawnSync('bash', [join(root, 'download-verified.sh'), url, artifact, join(root, 'installed')], {
    encoding: 'utf8', env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, DOWNLOAD_TEST_ROOT: root },
  });
  return { root, body, manifest, run };
}

it.each(['sha256', 'sha512'] as const)('publishes only bytes matching the reviewed %s digest', algorithm => {
  const { root, body, run } = fixture(algorithm);
  const result = run();
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(join(root, 'installed'), 'utf8')).toBe(body);
});

it('preserves an existing file when a downloaded release has been modified', () => {
  const { root, run } = fixture();
  writeFileSync(join(root, 'payload'), 'tampered bytes');
  const result = run();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('checksum mismatch');
  expect(readFileSync(join(root, 'installed'), 'utf8')).toBe('existing installation');
});

it('preserves an existing file when the download fails after writing partial bytes', () => {
  const { root, run } = fixture();
  writeFileSync(join(root, 'bin/curl'), `#!/bin/bash
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then printf partial > "$2"; exit 22; fi
  shift
done
exit 22
`, { mode: 0o755 });
  expect(run().status).not.toBe(0);
  expect(readFileSync(join(root, 'installed'), 'utf8')).toBe('existing installation');
});

it.each(['missing', 'duplicate', 'malformed'])('rejects a %s checksum before fetching anything', scenario => {
  const { root, manifest, run } = fixture();
  writeFileSync(join(root, 'release-checksums.txt'), scenario === 'missing' ? '' : scenario === 'duplicate' ? manifest + manifest : manifest.replace(/^sha256 [0-9a-f]+/, 'sha256 invalid'));
  expect(run().status).not.toBe(0);
  expect(existsSync(join(root, 'fetched'))).toBe(false);
  expect(readFileSync(join(root, 'installed'), 'utf8')).toBe('existing installation');
});

it('rejects a non-HTTPS or unexpected release origin before fetching anything', () => {
  const { root, run } = fixture();
  for (const url of ['http://nodejs.org/dist/v1.2.3/tool', 'https://nodejs.org.attacker.test/dist/tool']) {
    expect(run(url).status).not.toBe(0);
  }
  expect(existsSync(join(root, 'fetched'))).toBe(false);
});
