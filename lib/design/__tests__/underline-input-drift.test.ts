import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ROOT, walkAll } from './_source-scan';

// The underline field was hand-copied into fifteen files, so changing one
// utility in it (the WCAG placeholder colour, as it happened) meant editing
// fifteen call sites and hoping none were missed. Thirteen now import the
// shared constant; this keeps a sixteenth copy from appearing.
//
// Signature rather than exact string: every copy differed slightly, so an
// equality check would have matched none of them. These four utilities together
// only ever appear on this one field.
const UNDERLINE_FIELD_SIGNATURE = [
  'bg-transparent',
  'border-b',
  'placeholder:text-[var(--md-sys-color-on-surface-variant)]',
  'focus:outline-none',
];

/**
 * Files that legitimately spell the field out instead of composing it.
 *
 * Both differ in LAYOUT, not styling, and deriving them would change the
 * rendered box: `underlineInputBase` carries `block w-full`, which fights
 * `flex-1` in a flex row and is not what the compact variant wants either.
 * Widening the shared constant to cover them needs a visual check first.
 */
const INLINE_ALLOWED = [
  // 사업자번호 입력 — 조회 버튼과 한 줄에 놓이는 flex row 자식이라 `flex-1`.
  'components/rfp/BizLookupField.tsx',
  // 워크스페이스 생성 — 조밀한 인라인 편집 필드라 `py-1`, `block` 없음.
  'components/workspace/CreateWorkspaceForm.tsx',
];

describe('underline field is composed, not copied', () => {
  it('no file outside components/forms/inputs.tsx inlines the underline field', () => {
    const offenders: string[] = [];
    for (const file of walkAll()) {
      if (file === 'components/forms/inputs.tsx' || INLINE_ALLOWED.includes(file)) continue;
      readFileSync(`${ROOT}${file}`, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (UNDERLINE_FIELD_SIGNATURE.every((u) => line.includes(u)))
            offenders.push(`${file}:${i + 1}`);
        });
    }
    expect(
      offenders,
      'These lines spell out the underline input field by hand. Import ' +
        '`underlineInputClass` from @/components/forms/inputs (or compose ' +
        '`underlineInputBase` + your own border clause when the border is ' +
        'state-driven) so the next token change is one edit, not sixteen.',
    ).toEqual([]);
  });

  it('every inline exemption is still a real one (no stale entries)', () => {
    for (const file of INLINE_ALLOWED) {
      const inlined = readFileSync(`${ROOT}${file}`, 'utf8')
        .split('\n')
        .some((line) => UNDERLINE_FIELD_SIGNATURE.every((u) => line.includes(u)));
      expect(
        inlined,
        `"${file}" no longer inlines the underline field — remove it from INLINE_ALLOWED.`,
      ).toBe(true);
    }
  });
});
