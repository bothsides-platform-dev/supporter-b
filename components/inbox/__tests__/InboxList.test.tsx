import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(''),
}));

import { InboxList, InboxListSkeleton } from '../InboxList';
import type { InboxRow } from '../InboxList';

const row: InboxRow = {
  invitationId: 'inv-001',
  invitationStatus: 'sent',
  rfpStatus: 'sent',
  rfpId: 'P-2604-0001',
  rfpTitle: 'PG 결제대행 RFP',
  rfpDeadline: new Date(Date.now() + 86_400_000).toISOString(),
  grade: '일반',
};

afterEach(() => {
  cleanup();
  replace.mockClear();
});

describe('InboxList', () => {
  it('행 클릭 시 ?peek=<rfpId>로 replace', async () => {
    const user = userEvent.setup();
    render(<InboxList rows={[row]} />);
    await user.click(screen.getByText('PG 결제대행 RFP'));
    expect(replace).toHaveBeenCalledWith('/inbox?peek=P-2604-0001');
  });

  it('번호 컬럼에 rfpId(code)를 표시', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.getByText('P-2604-0001')).toBeInTheDocument();
  });

  it('InboxRow에 rfpStatus 필드가 포함됨', () => {
    const rowWithClosedRfp: InboxRow = {
      ...row,
      invitationId: 'inv-002',
      rfpStatus: 'closed',
    };
    render(<InboxList rows={[rowWithClosedRfp]} />);
    expect(screen.getByText('P-2604-0001')).toBeInTheDocument();
  });

  it('초대 상태 Chip을 렌더', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.getByText('신규')).toBeInTheDocument();
  });

  it('opened 초대는 작성중 대신 신규로 표시', () => {
    const openedRow: InboxRow = { ...row, invitationId: 'inv-003', invitationStatus: 'opened' };
    render(<InboxList rows={[openedRow]} />);
    expect(screen.queryByText('작성중')).not.toBeInTheDocument();
    expect(screen.getByText('신규')).toBeInTheDocument();
  });

  it('하단 키보드 힌트 문구를 표시하지 않는다', () => {
    const { container } = render(<InboxList rows={[row]} />);
    expect(container.textContent).not.toContain('J / K 이동');
  });

  it('신규(sent) 행은 "견적 작성" 행동 링크를 보여준다', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.getByRole('link', { name: '견적 작성' })).toHaveAttribute('href', '/inbox/P-2604-0001');
  });

  it('견적 보낸(accepted) 행은 "보낸 견적" 행동 링크를 보여준다', () => {
    render(<InboxList rows={[{ ...row, invitationId: 'inv-004', invitationStatus: 'accepted' }]} />);
    expect(screen.getByRole('link', { name: '보낸 견적' })).toHaveAttribute(
      'href',
      '/inbox/P-2604-0001/submitted',
    );
  });
});

describe('InboxListSkeleton — RSC fallback 회귀 방지', () => {
  // 서버 컴포넌트 app/(app)/inbox/page.tsx 는 named export InboxListSkeleton 을
  // import 해 Suspense fallback 으로 쓴다. 'use client' 컴포넌트의 static
  // InboxList.Skeleton 은 RSC 경계 너머에서 undefined 라(fallback 렌더 시점에만
  // 크래시) named export 가 standalone 으로 반드시 살아 있어야 한다. 이 named
  // export 를 지우고 static 으로만 되돌리면 이 테스트가 빨갛게 떨어진다.
  it('standalone named export 로 존재하고 단독 렌더된다', () => {
    expect(typeof InboxListSkeleton).toBe('function');
    const { container } = render(<InboxListSkeleton />);
    expect(container.firstChild).not.toBeNull();
  });
});
