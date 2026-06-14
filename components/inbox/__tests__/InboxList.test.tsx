import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(''),
}));

import { InboxList, InboxListSkeleton } from '../InboxList';
import type { InboxRow } from '../InboxList';

const row: InboxRow = {
  invitationId: 'inv-001',
  stage: 'received',
  rfpId: 'P-2604-0001',
  rfpTitle: 'PG 결제대행 RFP',
  rfpDeadline: new Date(Date.now() + 86_400_000).toISOString(),
  grade: '일반',
};

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe('InboxList', () => {
  it('행 클릭 시 상세 라우트(/inbox/<rfpId>)로 push — 딜룸 모달 오픈', async () => {
    const user = userEvent.setup();
    render(<InboxList rows={[row]} />);
    await user.click(screen.getByText('PG 결제대행 RFP'));
    expect(push).toHaveBeenCalledWith('/inbox/P-2604-0001');
  });

  it('번호 컬럼에 rfpId(code)를 표시', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.getByText('P-2604-0001')).toBeInTheDocument();
  });

  it('received 단계 Chip을 신규로 렌더', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.getByText('신규')).toBeInTheDocument();
  });

  it('isSample 행에는 샘플 칩을 표시한다', () => {
    render(<InboxList rows={[{ ...row, isSample: true }]} />);
    expect(screen.getByText('샘플')).toBeInTheDocument();
  });

  it('isSample 아닌 행에는 샘플 칩이 없다', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.queryByText('샘플')).not.toBeInTheDocument();
  });

  it('won 단계는 선정됨, lost 단계는 미선정 Chip을 렌더', () => {
    render(
      <InboxList
        rows={[
          { ...row, invitationId: 'inv-won', stage: 'won', bidId: 'bid-1' },
          { ...row, invitationId: 'inv-lost', stage: 'lost', bidId: 'bid-2' },
        ]}
      />,
    );
    expect(screen.getByText('선정됨')).toBeInTheDocument();
    expect(screen.getByText('미선정')).toBeInTheDocument();
  });

  it('received 단계는 작성중이 아닌 신규로 표시', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.queryByText('작성중')).not.toBeInTheDocument();
    expect(screen.getByText('신규')).toBeInTheDocument();
  });

  it('하단 키보드 힌트 문구를 표시하지 않는다', () => {
    const { container } = render(<InboxList rows={[row]} />);
    expect(container.textContent).not.toContain('J / K 이동');
  });

  it('received 행은 "견적 작성" 행동 링크를 보여준다', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.getByRole('link', { name: '견적 작성' })).toHaveAttribute('href', '/inbox/P-2604-0001');
  });

  it('submitted 행은 "보낸 견적" 행동 링크를 딜룸으로 보여준다', () => {
    render(<InboxList rows={[{ ...row, invitationId: 'inv-004', stage: 'submitted', bidId: 'bid-3' }]} />);
    // 별도 /submitted 라우트 제거 — 딜룸(/inbox/<code>)이 제출 완료 상태를 렌더.
    expect(screen.getByRole('link', { name: '보낸 견적' })).toHaveAttribute(
      'href',
      '/inbox/P-2604-0001',
    );
  });

  it('bid 없이 마감된(lost, 미제출) 행은 행동 링크 대신 — 를 보여준다', () => {
    render(<InboxList rows={[{ ...row, invitationId: 'inv-005', stage: 'lost' }]} />);
    expect(screen.queryByRole('link', { name: '견적 작성' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '보낸 견적' })).not.toBeInTheDocument();
  });

  it("contractType 'new' 이면 '신규 계약' Chip을 표시한다", () => {
    render(<InboxList rows={[{ ...row, contractType: 'new' }]} />);
    expect(screen.getByText('신규 계약')).toBeInTheDocument();
  });

  it("contractType 'renewal' 이면 '갱신 계약' Chip을 표시한다", () => {
    render(<InboxList rows={[{ ...row, contractType: 'renewal' }]} />);
    expect(screen.getByText('갱신 계약')).toBeInTheDocument();
  });

  it('contractType 없으면 계약 유형 Chip을 표시하지 않는다', () => {
    render(<InboxList rows={[{ ...row, contractType: null }]} />);
    expect(screen.queryByText('신규 계약')).not.toBeInTheDocument();
    expect(screen.queryByText('갱신 계약')).not.toBeInTheDocument();
  });

  it('hasPendingRequote가 true이면 재요청 Chip을 표시한다', () => {
    render(<InboxList rows={[{ ...row, hasPendingRequote: true }]} />);
    expect(screen.getByText('재요청')).toBeInTheDocument();
  });

  it('hasPendingRequote가 false/undefined이면 재요청 Chip을 표시하지 않는다', () => {
    render(<InboxList rows={[row]} />);
    expect(screen.queryByText('재요청')).not.toBeInTheDocument();
  });

  it('종결 단계(won/lost)에서는 pending 재요청이 남아 있어도 Chip을 숨긴다 — 응답 불가 액션', () => {
    // 재요청은 재제출로만 resolve 되므로 RFP 종결 시 pending 이 영구 잔류할 수 있다.
    render(
      <InboxList
        rows={[
          { ...row, invitationId: 'inv-w', stage: 'won', hasPendingRequote: true },
          { ...row, invitationId: 'inv-l', stage: 'lost', hasPendingRequote: true },
        ]}
      />,
    );
    expect(screen.queryByText('재요청')).not.toBeInTheDocument();
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
