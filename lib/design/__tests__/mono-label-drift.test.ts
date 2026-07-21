import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MONO_LABEL_ALLOWLIST } from '../design-hardrule-allowlist.mjs';

// Drift guard for the DESIGN.md §9 typography hard rule:
//
//   "No 내비/라벨에 font-mono uppercase wide-tracking — sentence case + 약한 음수
//    자간. `.md-numeric`은 금융 수치에만."
//
// Two invariants over `app/**` + `components/**` (allowlisted prefixes aside):
//   1. `font-mono` never co-occurs with `uppercase` — that combination is the
//      banned label treatment. Use `.md-label-{small,medium,large}` instead.
//   2. `font-mono` never co-occurs with `tabular-nums` — that pair IS the
//      `.md-numeric` carve-out, spelled out longhand. Use `.md-numeric`.
//
// Deliberately LINE-scoped rather than string-literal-scoped: a quote-pairing
// scanner trips over apostrophes in Korean/English prose (`don't`), and every
// className in this codebase keeps its utility tokens on one line. The tradeoff
// is that a className split across source lines could slip through — acceptable,
// since the check exists to stop copy-paste propagation of the exact pattern.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // repo root
const SCAN_ROOTS = ['app', 'components'];

type Violation = { file: string; line: number; rule: string; text: string };

function* walk(relDir: string): Generator<string> {
  for (const entry of readdirSync(`${ROOT}${relDir}`, { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      yield* walk(rel);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      yield rel;
    }
  }
}

function isAllowlisted(file: string): boolean {
  return MONO_LABEL_ALLOWLIST.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
}

/** Lines where `font-mono` sits beside a banned companion utility. */
function findViolations(file: string): Violation[] {
  const found: Violation[] = [];
  const lines = readFileSync(`${ROOT}${file}`, 'utf8').split('\n');
  lines.forEach((text, i) => {
    if (!text.includes('font-mono')) return;
    if (text.includes('uppercase')) {
      found.push({ file, line: i + 1, rule: 'font-mono + uppercase', text: text.trim() });
    }
    if (text.includes('tabular-nums')) {
      found.push({ file, line: i + 1, rule: 'font-mono + tabular-nums', text: text.trim() });
    }
  });
  return found;
}

function scanAll(): Violation[] {
  const found: Violation[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      if (isAllowlisted(file)) continue;
      found.push(...findViolations(file));
    }
  }
  return found;
}

describe('DESIGN.md §9 — no font-mono label treatment on app surfaces', () => {
  it('no non-allowlisted file pairs font-mono with uppercase or tabular-nums', () => {
    const offenders = scanAll();
    expect(
      offenders.map((v) => `${v.file}:${v.line} [${v.rule}]`),
      'These lines violate the DESIGN.md §9 typography hard rule. Replace the label ' +
        'treatment with .md-label-{small,medium,large} and the numeric pair with ' +
        '.md-numeric (app/globals.css). A surface that genuinely needs the mono look ' +
        'must be added to lib/design/design-hardrule-allowlist.mjs with a DESIGN.md §9 ' +
        'exception recorded.',
    ).toEqual([]);
  });

  it('every allowlist prefix still shelters a real exemption (no stale entries)', () => {
    for (const prefix of MONO_LABEL_ALLOWLIST) {
      const hits = [...walk(prefix)].flatMap(findViolations);
      expect(
        hits.length,
        `"${prefix}" is allowlisted but no longer uses the mono label treatment — ` +
          'remove it from lib/design/design-hardrule-allowlist.mjs.',
      ).toBeGreaterThan(0);
    }
  });
});
