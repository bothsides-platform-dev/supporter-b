#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { nodeFileTrace } from '@vercel/nft';

const [output, sha, run, attempt] = process.argv.slice(2);
if (!output || !/^[0-9a-f]{40}$/.test(sha) || !/^[1-9][0-9]*$/.test(run) || !/^[1-9][0-9]*$/.test(attempt)) {
  throw new Error('Expected output directory, commit SHA, run number and attempt.');
}
const releaseId = `${sha}-${run}-${attempt}`;
if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== sha) {
  throw new Error('The artifact revision must match the checked out commit.');
}
if (readFileSync('.next/standalone/.next/BUILD_ID', 'utf8').trim() !== sha) {
  throw new Error('The standalone build must belong to the requested commit.');
}
const schema = createHash('sha256').update(execFileSync('git', [
  'ls-tree', '-r', 'HEAD', '--', 'lib/db/schema', 'scripts/migrations', 'scripts/sql', 'docs/migrations', 'drizzle.config.ts',
])).digest('hex');
const metadata = { sha, releaseId, runNumber: Number(run), schema, nodeVersion: process.versions.node };
const stage = mkdtempSync(join(tmpdir(), 'staging-runtime-'));
const out = resolve(output);
mkdirSync(out, { recursive: true });
try {
  // Runtime secrets are injected on the VM, never copied into the artifact.
  cpSync('.next/standalone', stage, { recursive: true, verbatimSymlinks: true, filter: path => !basename(path).startsWith('.env') });
  cpSync('public', join(stage, 'public'), { recursive: true });
  cpSync('.next/static', join(stage, '.next/static'), { recursive: true });
  cpSync('assets/fonts', join(stage, 'assets/fonts'), { recursive: true });
  cpSync('.staging-ops', join(stage, '.ops'), { recursive: true });
  // Next may bundle a dependency into app chunks without exposing it to the
  // standalone CLI commands. Trace their external runtime packages separately.
  const { fileList } = await nodeFileTrace(['.staging-ops/check.cjs', '.staging-ops/sync.cjs']);
  for (const entry of fileList) {
    const file = entry.replace(/\/$/, '');
    if (!file.startsWith('node_modules/') || basename(file).startsWith('.env')) continue;
    const target = join(stage, file);
    const source = lstatSync(file);
    if (source.isDirectory()) { mkdirSync(target, { recursive: true }); continue; }
    mkdirSync(dirname(target), { recursive: true });
    if (source.isSymbolicLink()) rmSync(target, { recursive: true, force: true });
    cpSync(file, target, { recursive: true, verbatimSymlinks: true });
  }
  cpSync('docker-compose.prod.yml', join(stage, '.ops/docker-compose.yml'));
  cpSync('deploy/centrifugo', join(stage, '.ops/deploy/centrifugo'), { recursive: true });
  writeFileSync(join(stage, '.release.json'), `${JSON.stringify(metadata)}\n`);
  const archive = `${releaseId}.tar.gz`;
  execFileSync('tar', ['-czf', join(out, archive), '-C', stage, '.']);
  const digest = createHash('sha256').update(readFileSync(join(out, archive))).digest('hex');
  writeFileSync(join(out, 'release.json'), `${JSON.stringify({ ...metadata, archive, digest })}\n`);
  console.log(`Packaged ${releaseId} (${digest})`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
