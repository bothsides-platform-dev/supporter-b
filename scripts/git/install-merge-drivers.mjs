#!/usr/bin/env node
// Register the `semver-max` git merge driver for this clone.
//
// Merge drivers live in .git/config, which is not committed, so they must be
// installed per-clone. This runs from the `prepare` npm script (on every
// `pnpm install`) and is idempotent. The matching `merge=semver-max` attribute
// lives in the committed .gitattributes. See scripts/git/version-merge.mjs.

import { spawnSync } from 'node:child_process';

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

// Skip silently when there's no git repo (e.g. a tarball install in CI/prod).
if (git(['rev-parse', '--git-dir']).status !== 0) {
  process.exit(0);
}

const driver = 'node scripts/git/version-merge.mjs %O %A %B %P';
const name = 'take the higher semver for VERSION/package.json';

git(['config', 'merge.semver-max.name', name]);
git(['config', 'merge.semver-max.driver', driver]);

process.stdout.write('git merge driver `semver-max` registered\n');
