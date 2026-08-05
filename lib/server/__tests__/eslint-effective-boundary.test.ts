import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// Effective-config drift guard for restricted-import boundaries.
//
// ESLint flat config does NOT merge rule options — when two config blocks both
// set `@typescript-eslint/no-restricted-imports` and their `files` overlap, the
// later block replaces the earlier one's patterns wholesale. That is exactly how
// the `ssr-boundary/pdfjs` block (files: lib/** + app/** + components/**) once
// silently erased `repo-boundary/db-access` on all of lib/** and app/** while
// `pnpm lint` stayed green (found by the v0.4.42.0 release-cut audit).
//
// The fs-walk guard (repo-boundary.test.ts) still catches real DB-boundary
// violations, but nothing caught the *rule itself* dying. This test closes that
// hole by asserting the EFFECTIVE config per surface — any new config block that
// clobbers an existing restricted-import guard turns red here, not in review.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const DB_GROUP = '@/lib/db/schema';
const PDFJS_GROUP = 'pdfjs-dist';

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

/** Flattened `group` entries of every no-restricted-imports pattern in effect. */
async function restrictedGroups(file: string): Promise<string[]> {
  const cfg = (await eslint.calculateConfigForFile(`${ROOT}${file}`)) as {
    rules?: Record<string, unknown>;
  };
  const rule = cfg.rules?.['@typescript-eslint/no-restricted-imports'];
  if (!Array.isArray(rule)) return [];
  const [severity, ...options] = rule as [unknown, ...Array<{ patterns?: Array<{ group?: string[] }> }>];
  // A guard demoted to "warn" is a guard that no longer blocks — treat as absent.
  if (severity !== 2 && severity !== 'error') return [];
  return options.flatMap((o) => o.patterns ?? []).flatMap((p) => p.group ?? []);
}

describe('effective no-restricted-imports config per surface', () => {
  it('lib/server services carry BOTH the DB-boundary and pdfjs patterns', async () => {
    const groups = await restrictedGroups('lib/server/services/contract-signing.ts');
    expect(groups).toContain(DB_GROUP);
    expect(groups).toContain(PDFJS_GROUP);
  });

  it('app routes carry BOTH the DB-boundary and pdfjs patterns', async () => {
    const groups = await restrictedGroups('app/api/signing/webhook/route.ts');
    expect(groups).toContain(DB_GROUP);
    expect(groups).toContain(PDFJS_GROUP);
  });

  it('components carry the pdfjs pattern', async () => {
    const groups = await restrictedGroups('components/deal-room/signing/SigningTab.tsx');
    expect(groups).toContain(PDFJS_GROUP);
  });

  it('ContractTemplateEditor (the ssr:false boundary) is exempt from the pdfjs pattern', async () => {
    const groups = await restrictedGroups('components/contract-templates/ContractTemplateEditor.tsx');
    expect(groups).not.toContain(PDFJS_GROUP);
  });

  it('the repo layer stays exempt from the DB-boundary pattern', async () => {
    const groups = await restrictedGroups('lib/server/repositories/drizzle/signing-contract.ts');
    expect(groups).not.toContain(DB_GROUP);
  });
});
