#!/usr/bin/env node
// Git merge driver: auto-resolve version-only conflicts to the higher semver.
//
// Parallel `/ship` runs branch off the same base, so two feature branches can
// both bump VERSION / package.json to the same next slot. When the second one
// merges, git conflicts on VERSION, package.json "version", and CHANGELOG.
// CHANGELOG is handled by `merge=union` in .gitattributes; this driver handles
// the two version files: it runs a normal 3-way merge, then resolves any
// leftover conflict hunk whose two sides are both a version line by taking the
// higher semver. Any non-version conflict is left for a human (exit 1).
//
// Registered as merge driver `semver-max` (see scripts/git/install-merge-drivers.mjs).
// git invokes:  node scripts/git/version-merge.mjs %O %A %B %P
//   %O ancestor  %A ours/current (result written here)  %B theirs  %P pathname

import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Extract a semver from a line. Handles a bare version (`0.2.18.2`) and a
 * package.json version line (`  "version": "0.2.18.2",`). Returns the numeric
 * segments, or null when the line is not a version.
 * @param {string} s
 * @returns {number[] | null}
 */
export function parseSemver(s) {
  const trimmed = s.trim();
  const json = trimmed.match(/"version"\s*:\s*"v?(\d+(?:\.\d+)+)"/);
  if (json) return json[1].split('.').map(Number);
  const bare = trimmed.match(/^v?(\d+(?:\.\d+)+)$/);
  if (bare) return bare[1].split('.').map(Number);
  return null;
}

/**
 * Numeric (not lexical) semver comparison. Shorter version is zero-padded so
 * `1.4` sorts below `1.4.1`. Returns >0 if a>b, <0 if a<b, 0 if equal.
 * @param {number[]} a
 * @param {number[]} b
 */
export function compareSemver(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Post-process a 3-way-merged file: resolve conflict hunks whose two sides are
 * each a single version line, choosing the higher semver. Leave every other
 * conflict untouched.
 * @param {string} text
 * @returns {{ content: string; unresolved: number }}
 */
export function resolveVersionConflicts(text) {
  let unresolved = 0;
  const re = /^<<<<<<<.*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>>.*\n/gm;
  const content = text.replace(re, (match, ours, theirs) => {
    const oLine = ours.replace(/\n$/, '');
    const tLine = theirs.replace(/\n$/, '');
    if (oLine.includes('\n') || tLine.includes('\n')) {
      unresolved++;
      return match;
    }
    const ov = parseSemver(oLine);
    const tv = parseSemver(tLine);
    if (!ov || !tv) {
      unresolved++;
      return match;
    }
    return compareSemver(ov, tv) >= 0 ? ours : theirs;
  });
  return { content, unresolved };
}

function main() {
  const [ancestor, ours, theirs] = process.argv.slice(2);
  if (!ancestor || !ours || !theirs) {
    process.stderr.write('version-merge: expected %O %A %B [%P] arguments\n');
    process.exit(2);
  }
  const merged = spawnSync(
    'git',
    ['merge-file', '-p', '-L', 'ours', '-L', 'base', '-L', 'theirs', ours, ancestor, theirs],
    { encoding: 'utf8' },
  );
  // merge-file: status 0 = clean, >0 = conflict count, <0/null = error.
  if (merged.status === 0) {
    writeFileSync(ours, merged.stdout);
    process.exit(0);
  }
  if (merged.status == null || merged.status < 0) {
    process.stderr.write(`version-merge: git merge-file failed\n${merged.stderr ?? ''}`);
    process.exit(1);
  }
  const { content, unresolved } = resolveVersionConflicts(merged.stdout);
  writeFileSync(ours, content);
  if (unresolved > 0) {
    process.stderr.write(
      `version-merge: ${unresolved} non-version conflict(s) left for manual resolution\n`,
    );
    process.exit(1);
  }
  process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
