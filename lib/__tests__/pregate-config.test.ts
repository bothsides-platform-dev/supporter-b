// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ship test dependency declarations', () => {
  it('connects the public intake boundaries to runnable unit tests', () => {
    const file = resolve('.gstack/pregate.json');
    expect(
      existsSync(file),
      'repository test dependencies must be declared',
    ).toBe(true);
    const config = JSON.parse(readFileSync(file, 'utf8'));
    expect(config.runner).toBe('rtk proxy pnpm test {files}');
    for (const source of [
      'app/quote-start/page.tsx',
      'components/landing/QuoteStartLink.tsx',
      'components/pending-approval/ApprovalWaitingScreen.tsx',
      'lib/db/schema/guest-rfp.ts',
      'lib/db/schema/index.ts',
      'lib/guest-rfp/draft.ts',
      'lib/guest-rfp/events.ts',
      'lib/guest-rfp/files.ts',
      'lib/server/guest-rfp/request.ts',
      'lib/stores/rfp-draft-context.tsx',
      'lib/types/pg-recommendation.ts',
      // /ship stamps the version here, so the lane checks the VERSION
      // translation. Dependency and script edits still pass this lane; CI's
      // full suite is what verifies them.
      'package.json',
    ]) {
      expect(config.dependencies[source], source).toBeInstanceOf(Array);
      expect(config.dependencies[source].length, source).toBeGreaterThan(0);
    }
    for (const paths of Object.values(config.dependencies) as string[][]) {
      for (const test of paths) {
        expect(
          test,
          'the unit runner must not receive Playwright specs',
        ).toMatch(/\.test\.tsx?$/);
        expect(existsSync(resolve(test)), test).toBe(true);
      }
    }
    expect(config.warn).toEqual([]);
  });
});
