import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MONO_LABEL_ALLOWLIST } from '../design-hardrule-allowlist.mjs';
import { ROOT, type Violation, allowlistTargets, isAllowlisted, walkAll } from './_source-scan';

// Every finding this guard emits names which of its rules fired, so the failure
// message can print it. Narrowing here keeps `[undefined]` out of that message.
type RuledViolation = Violation & { rule: string };

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

/** Lines where `font-mono` sits beside a banned companion utility. */
function findViolations(file: string): RuledViolation[] {
  const found: RuledViolation[] = [];
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

function scanAll(): RuledViolation[] {
  const found: RuledViolation[] = [];
  for (const file of walkAll()) {
    if (isAllowlisted(file, MONO_LABEL_ALLOWLIST)) continue;
    found.push(...findViolations(file));
  }
  return found;
}

/**
 * Lines that spell a whole label typescale out longhand instead of using the
 * `.md-label-*` utility.
 *
 * The signature is size AND weight from the label typescale on one line — that
 * combination only appears when someone is dressing a full label role, which is
 * exactly what the utility exists for. Consuming a SINGLE axis stays legal:
 * Button/Chip/Avatar/NavItem take `text-[length:var(--md-typescale-label-*-size)]`
 * and own their own weight and leading, so they are composing a token, not
 * spelling a competing label notation.
 *
 * Known blind spot, same as the mono rules above: this is line-scoped, so a
 * `cn()` call that puts each utility on its own line slips through. Chip and
 * Tabs do exactly that today and stay deliberately — they are fixed-height flex
 * controls where a label's line-height is a no-op, which is why they omit it.
 * The guard exists to stop copy-paste of the one-line label nailing, not to
 * police every token combination.
 */
function findLabelNailings(file: string): RuledViolation[] {
  const found: RuledViolation[] = [];
  const lines = readFileSync(`${ROOT}${file}`, 'utf8').split('\n');
  lines.forEach((text, i) => {
    if (
      text.includes('length:var(--md-typescale-label-') &&
      text.includes('number:var(--md-typescale-label-')
    ) {
      found.push({ file, line: i + 1, rule: 'label typescale longhand', text: text.trim() });
    }
  });
  return found;
}

function scanAllLabelNailings(): RuledViolation[] {
  const found: RuledViolation[] = [];
  for (const file of walkAll()) found.push(...findLabelNailings(file));
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

  // Third invariant, same walk: one label notation, not two. `.md-label-*` and a
  // longhand token nailing render identically, so both survived side by side —
  // leaving the next person to guess which one to follow. The guard picks one.
  it('no file spells a full label typescale longhand instead of .md-label-*', () => {
    const offenders = scanAllLabelNailings();
    expect(
      offenders.map((v) => `${v.file}:${v.line}`),
      'These lines nail size AND weight from the label typescale by hand. Use the ' +
        '.md-label-{small,medium,large} utility (app/globals.css) — see DESIGN.md §3. ' +
        'Consuming one axis alone (size only) is still fine; it is the whole-label ' +
        'longhand that competes with the utility.',
    ).toEqual([]);
  });

  it('every allowlist prefix still shelters a real exemption (no stale entries)', () => {
    for (const prefix of MONO_LABEL_ALLOWLIST) {
      // `allowlistTargets` accepts a single file path as well as a directory
      // prefix — walking a file path would throw ENOTDIR — and returns null for
      // a path that no longer exists, so a deleted target reports as a stale
      // entry instead of dying on a raw ENOENT stack.
      const targets = allowlistTargets(prefix);
      expect(
        targets,
        `"${prefix}" is allowlisted but no longer exists — remove it from ` +
          'lib/design/design-hardrule-allowlist.mjs.',
      ).not.toBeNull();
      const hits = targets!.flatMap(findViolations);
      expect(
        hits.length,
        `"${prefix}" is allowlisted but no longer uses the mono label treatment — ` +
          'remove it from lib/design/design-hardrule-allowlist.mjs.',
      ).toBeGreaterThan(0);
    }
  });
});
