import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ROOT } from './_source-scan';

// Contrast guard for the DESIGN.md §2 text tokens.
//
// The sibling `outline-text-drift` guard enforces WHICH token gets used; this
// one enforces that the chosen token actually clears WCAG AA against every
// surface it can land on. Both are needed — a token-name rule certifies nothing
// if the token itself fails, which is exactly what happened: retiring `outline`
// (1.41:1) moved 80 sites onto `on-surface-variant`, and `on-surface-variant`
// was itself under 4.5:1 on the four darkest light-mode container tiers.
//
// Values are read from `styles/tokens.css` rather than duplicated here, so a
// token edit is measured rather than trusted.

const TOKENS = readFileSync(`${ROOT}styles/tokens.css`, 'utf8');

/** Split the sheet into its light (`:root`) and dark (`.dark`) declaration blocks. */
function scopeBlock(scope: 'light' | 'dark'): string {
  // The dark block is introduced by a `.dark` selector; everything before the
  // first one is the light scope.
  const darkAt = TOKENS.search(/^\.dark\b/m);
  if (darkAt < 0) throw new Error('tokens.css 에서 .dark 스코프를 찾지 못했다');
  return scope === 'light' ? TOKENS.slice(0, darkAt) : TOKENS.slice(darkAt);
}

function readToken(scope: 'light' | 'dark', name: string): string {
  const m = scopeBlock(scope).match(new RegExp(`--md-sys-color-${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`${scope} 스코프에서 --md-sys-color-${name} 를 찾지 못했다`);
  return m[1];
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Every surface a text token can legitimately sit on. `surface-bright` and
// `surface-dim` are included: they are real canvases, not decoration.
const SURFACE_TOKENS = [
  'surface',
  'surface-dim',
  'surface-bright',
  'surface-container-lowest',
  'surface-container-low',
  'surface-container',
  'surface-container-high',
  'surface-container-highest',
];

const AA_BODY = 4.5;

describe('DESIGN.md §2 — text tokens clear WCAG AA on every surface tier', () => {
  for (const scope of ['light', 'dark'] as const) {
    for (const text of ['on-surface', 'on-surface-variant'] as const) {
      it(`${scope}: ${text} is >= ${AA_BODY}:1 on every surface tier`, () => {
        const fg = readToken(scope, text);
        const failures = SURFACE_TOKENS.map((surface) => {
          const bg = readToken(scope, surface);
          return { surface, bg, ratio: contrast(fg, bg) };
        })
          .filter(({ ratio }) => ratio < AA_BODY)
          .map(({ surface, bg, ratio }) => `${surface} (${bg}): ${ratio.toFixed(2)}:1`);

        expect(
          failures,
          `--md-sys-color-${text} (${fg}) drops under the WCAG AA body floor of ` +
            `${AA_BODY}:1 on these ${scope} surfaces. Body text is 16px here, so the ` +
            'large-text 3:1 allowance does not apply. Darken the text token in ' +
            'styles/tokens.css (and mirror the value into the DESIGN.md §2 table), or ' +
            'lighten the surface — do not leave the pair shipping under AA.',
        ).toEqual([]);
      });
    }
  }

  it('outline stays a border token — it would fail AA as text, by a wide margin', () => {
    // Pins the premise the sibling `outline-text-drift` guard rests on. If a
    // future palette change ever made `outline` AA-safe as text, that guard's
    // rationale would need revisiting rather than silently outliving its reason.
    for (const scope of ['light', 'dark'] as const) {
      const ratio = contrast(readToken(scope, 'outline'), readToken(scope, 'surface'));
      expect(ratio, `${scope}: outline vs surface`).toBeLessThan(3);
    }
  });
});
