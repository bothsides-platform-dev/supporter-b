import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(''),
}));
// 미리보기 아래 상담 패널은 서버 액션을 부른다 — 이 테스트는 상단 행동만 본다.
vi.mock('@/lib/server/actions/rfp/matching', () => ({
  endAndRequestNextPgAction: vi.fn(),
  requestNextPgAction: vi.fn(),
  reviewPgRequestAction: vi.fn(),
}));

import { RequestPreview } from '../RequestPreview';
import { demoPgDealData } from '@/components/landing/demo-app/pg/pg-demo-fixtures';

afterEach(cleanup);

describe('RequestPreview 상단 행동', () => {
  // 다른 화면으로 이동하는 행동은 링크다. 링크 안에 버튼을 넣으면 Tab 이 두 번 멈춘다.
  it('작업 열기와 넓은 화면 보기는 버튼 모양의 링크 하나씩이다', () => {
    render(<RequestPreview data={demoPgDealData} />);
    const code = demoPgDealData.rfp.code;
    const wide = screen.getByRole('link', { name: '넓은 화면에서 보기' });
    expect(wide).toHaveAttribute('href', `/inbox/${code}`);
    expect(within(wide).queryByRole('button')).toBeNull();
    const work = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href')?.startsWith(`/inbox/${code}?tab=`));
    expect(work).toBeDefined();
    expect(within(work!).queryByRole('button')).toBeNull();
  });
});
