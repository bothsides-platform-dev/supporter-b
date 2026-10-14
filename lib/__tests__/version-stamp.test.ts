// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// VERSION is the four-part source of truth. npm rejects four parts, so
// package.json carries the first three (0.5.6.1 -> 0.5.6).
describe('version stamp', () => {
  it('keeps package.json at the three-part translation of VERSION', () => {
    const version = readFileSync(resolve('VERSION'), 'utf8').trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    expect(pkg.version).toBe(version.split('.').slice(0, 3).join('.'));
  });
});
