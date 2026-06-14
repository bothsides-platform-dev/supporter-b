// Unit tests for the git merge driver that auto-resolves version-only conflicts
// (VERSION + package.json "version") to the higher semver during parallel /ship.
// The driver runs a standard 3-way merge first; these tests cover the pure
// post-processing that resolves the leftover conflict hunks.
import { describe, expect, it } from 'vitest';
import {
  parseSemver,
  compareSemver,
  resolveVersionConflicts,
} from '../version-merge.mjs';

const C = (ours: string, theirs: string) =>
  `<<<<<<< ours\n${ours}\n=======\n${theirs}\n>>>>>>> theirs\n`;

describe('parseSemver', () => {
  it('parses a bare 4-segment version', () => {
    expect(parseSemver('0.2.18.2')).toEqual([0, 2, 18, 2]);
  });

  it('parses a 3-segment version', () => {
    expect(parseSemver('1.4.0')).toEqual([1, 4, 0]);
  });

  it('parses a package.json version line', () => {
    expect(parseSemver('  "version": "0.2.18.10",')).toEqual([0, 2, 18, 10]);
  });

  it('returns null for a non-version line', () => {
    expect(parseSemver('    "name": "supporter-b",')).toBeNull();
  });
});

describe('compareSemver', () => {
  it('orders by numeric segment, not lexical', () => {
    // 0.2.18.10 must be GREATER than 0.2.18.9 (lexical would say otherwise)
    expect(compareSemver([0, 2, 18, 10], [0, 2, 18, 9])).toBeGreaterThan(0);
  });

  it('treats equal versions as 0', () => {
    expect(compareSemver([0, 2, 18, 2], [0, 2, 18, 2])).toBe(0);
  });
});

describe('resolveVersionConflicts', () => {
  it('resolves a bare VERSION conflict to the higher version', () => {
    const r = resolveVersionConflicts(C('0.2.18.2', '0.2.18.3'));
    expect(r.unresolved).toBe(0);
    expect(r.content).toBe('0.2.18.3\n');
  });

  it('picks ours when ours is higher', () => {
    const r = resolveVersionConflicts(C('0.2.19.0', '0.2.18.5'));
    expect(r.unresolved).toBe(0);
    expect(r.content).toBe('0.2.19.0\n');
  });

  it('resolves a package.json version line preserving its formatting', () => {
    const r = resolveVersionConflicts(C('  "version": "0.2.18.2",', '  "version": "0.2.18.3",'));
    expect(r.unresolved).toBe(0);
    expect(r.content).toBe('  "version": "0.2.18.3",\n');
  });

  it('leaves a non-version conflict untouched and reports it unresolved', () => {
    const conflict = C('    "left-pad": "^1.0.0",', '    "right-pad": "^2.0.0",');
    const r = resolveVersionConflicts(conflict);
    expect(r.unresolved).toBe(1);
    expect(r.content).toContain('<<<<<<<');
    expect(r.content).toContain('>>>>>>>');
  });

  it('returns text unchanged when there are no conflicts', () => {
    const clean = '{\n  "version": "0.2.18.3"\n}\n';
    const r = resolveVersionConflicts(clean);
    expect(r.unresolved).toBe(0);
    expect(r.content).toBe(clean);
  });

  it('resolves version conflicts while leaving surrounding clean content intact', () => {
    const text =
      '{\n  "name": "supporter-b",\n' +
      C('  "version": "0.2.18.2",', '  "version": "0.2.18.4",') +
      '  "private": true\n}\n';
    const r = resolveVersionConflicts(text);
    expect(r.unresolved).toBe(0);
    expect(r.content).toBe(
      '{\n  "name": "supporter-b",\n  "version": "0.2.18.4",\n  "private": true\n}\n',
    );
  });
});
