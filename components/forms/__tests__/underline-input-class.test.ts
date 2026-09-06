import { describe, expect, it } from 'vitest';

import { underlineInputBase, underlineInputBorder, underlineInputClass } from '../inputs';

// `underlineInputClass` is composed from two halves so that state-driven fields
// can swap the border without re-copying the whole list. This pins the composed
// result to the exact utility set the field shipped with before the split — the
// halves may be re-cut, but the rendered field must not drift.
//
// Set comparison, not string comparison: `cn()` is tailwind-merge, so it is free
// to reorder. Order carries no meaning in a class attribute (the stylesheet
// decides cascade), and pinning it would fail on a harmless refactor.
const EXPECTED = [
  'block',
  'w-full',
  'bg-transparent',
  'border-0',
  'border-b',
  'border-[var(--md-sys-color-outline)]',
  'py-2',
  'text-base',
  'text-[var(--md-sys-color-on-surface)]',
  'placeholder:text-[var(--md-sys-color-on-surface-variant)]',
  'focus:outline-none',
  'focus:border-[var(--md-sys-color-on-surface)]',
  'transition-colors',
];

const tokens = (s: string) => s.split(/\s+/).filter(Boolean).sort();

describe('underlineInputClass', () => {
  it('renders exactly the utility set the underline field shipped with', () => {
    expect(tokens(underlineInputClass)).toEqual(tokens(EXPECTED.join(' ')));
  });

  it('the base half carries no border colour, so a caller can supply its own', () => {
    // If a colour leaked back into the base, `cn(base, 'border-[var(--x)]')`
    // would still win via tailwind-merge — but the read-only/error/found states
    // that compose the base would silently inherit a default they never asked
    // for whenever they omit their own border clause.
    expect(underlineInputBase).not.toMatch(/(?<!focus:)border-\[var\(/);
    expect(underlineInputBase).not.toMatch(/focus:border-\[var\(/);
  });

  it('base and border are disjoint — no utility is declared twice', () => {
    const overlap = tokens(underlineInputBase).filter((t) =>
      tokens(underlineInputBorder).includes(t),
    );
    expect(overlap).toEqual([]);
  });
});
