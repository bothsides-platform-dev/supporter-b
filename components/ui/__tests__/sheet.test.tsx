import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Sheet, SheetContent, SheetTitle } from '../sheet';

// 폭은 base 클래스를 **교체**해야 한다. 예전엔 호출부가 `sm:max-w-md` 를 얹었는데
// base 의 `data-[side=right]:sm:max-w-sm` 이 속성 셀렉터라 특이도에서 이겨,
// 넘긴 폭이 조용히 죽고 드로어가 448px → 384px 로 좁아졌다.
describe('SheetContent size', () => {
  it('기본은 sm 폭이다', () => {
    render(
      <Sheet open>
        <SheetContent side="right">
          <SheetTitle>제목</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const el = screen.getByRole('dialog');
    expect(el.className).toContain('data-[side=right]:sm:max-w-sm');
    expect(el.className).not.toContain('data-[side=right]:sm:max-w-md');
  });

  it('size="md" 면 경쟁 클래스 없이 md 폭만 남는다', () => {
    render(
      <Sheet open>
        <SheetContent side="right" size="md">
          <SheetTitle>제목</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const el = screen.getByRole('dialog');
    expect(el.className).toContain('data-[side=right]:sm:max-w-md');
    expect(el.className).not.toContain('data-[side=right]:sm:max-w-sm');
  });

  it('기본 닫기 버튼의 접근 가능한 이름이 한국어다', () => {
    render(
      <Sheet open>
        <SheetContent side="right">
          <SheetTitle>제목</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });
});
