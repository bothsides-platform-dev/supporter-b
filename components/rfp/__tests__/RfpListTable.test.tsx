// components/rfp/__tests__/RfpListTable.test.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/rfp',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/server/actions/onboarding/deleteSampleRfpAction', () => ({
  deleteSampleRfpAction: vi.fn(async () => ({ ok: true })),
}));

import { RfpListTable, RfpListTableSkeleton } from '../RfpListTable';
import type { RFP } from '@/lib/types/rfp';

function makeRfp(overrides: Partial<RFP> & Pick<RFP, 'code' | 'title'>): RFP {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    buyerWsId: 'ws-buyer',
    memo: '',
    rfpFiles: [],
    allowedPgWorkspaceIds: [],
    requiredPaymentMethods: [],
    customPaymentMethods: [],
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'sent',
    createdBy: 'u1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const rfp = makeRfp({ code: 'P-2604-0001', title: '결제대행 RFP' });
const rfpSecond = makeRfp({
  id: '22222222-2222-2222-2222-222222222222',
  code: 'P-2604-0002',
  title: '두 번째 RFP',
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe('RfpListTable', () => {
  it('각 견적 요청을 Tab으로 열 수 있는 링크로 제공한다', () => {
    render(<RfpListTable rfps={[rfp]} />);
    expect(screen.getByRole('link', { name: /결제대행 RFP/ })).toHaveAttribute('href', '/rfp/P-2604-0001');
  });

  it('수정 키로 제목 링크를 열 때 현재 목록 이동을 가로채지 않는다', () => {
    render(<RfpListTable rfps={[rfp]} />);
    const link = screen.getByRole('link', { name: /결제대행 RFP/ });
    link.addEventListener('click', (event) => event.preventDefault()); // jsdom 외부 탐색은 실행하지 않음
    fireEvent.click(link, { metaKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it('구매사가 다음에 할 일을 상담·견적 단계에 맞춰 보여준다', () => {
    render(<RfpListTable rfps={[rfp, rfpSecond]} progressByRfpId={{
      [rfp.id]: { bidCount: 1, reviewStatus: 'quoted' },
      [rfpSecond.id]: { bidCount: 0, reviewStatus: 'rejected' },
    }} />);
    expect(screen.getByText('견적 도착')).toBeInTheDocument();
    expect(screen.getByText('견적 확인하기')).toBeInTheDocument();
    expect(screen.getByText('다음 PG사 선택')).toBeInTheDocument();
  });

  it('상담 요청과 검토, 철회, 선정 완료의 다음 행동을 구분한다', () => {
    const requested = makeRfp({ id: 'requested', code: 'P-REQUESTED', title: '요청한 상담' });
    const reviewing = makeRfp({ id: 'reviewing', code: 'P-REVIEWING', title: '검토 중인 상담' });
    const withdrawn = makeRfp({ id: 'withdrawn', code: 'P-WITHDRAWN', title: '철회된 상담' });
    const awarded = makeRfp({ id: 'awarded', code: 'P-AWARDED', title: '선정한 견적', status: 'awarded' });
    render(<RfpListTable rfps={[requested, reviewing, withdrawn, awarded]} progressByRfpId={{
      requested: { bidCount: 0, reviewStatus: 'requested' },
      reviewing: { bidCount: 0, reviewStatus: 'reviewing' },
      withdrawn: { bidCount: 0, reviewStatus: 'withdrawn' },
    }} />);
    expect(screen.getByRole('link', { name: /요청한 상담 · 상담 요청 완료 · 상담 현황 보기/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /검토 중인 상담 · PG 검토 중 · 상담 현황 보기/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /철회된 상담 · 다음 PG사 선택 · 상담 이어가기/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /선정한 견적 · 선정완료 · 계약 확인하기/ })).toBeInTheDocument();
  });

  it('sent 상태라도 마감 시각이 지났으면 마감으로 보여준다', () => {
    render(<RfpListTable rfps={[makeRfp({ code: 'P-PAST', title: '지난 요청', deadline: '2020-01-01T00:00:00.000Z' })]} />);
    expect(screen.getByRole('link', { name: /지난 요청 · 마감/ })).toBeInTheDocument();
    expect(screen.queryByText('요청 보냄')).not.toBeInTheDocument();
  });

  it('마감 뒤에도 도착한 견적은 확인 행동을 남긴다', () => {
    const expired = makeRfp({ code: 'P-PAST-BID', title: '마감된 상담', deadline: '2020-01-01T00:00:00.000Z' });
    render(<RfpListTable rfps={[expired]} progressByRfpId={{ [expired.id]: { bidCount: 1 } }} />);
    expect(screen.getByRole('link', { name: /마감된 상담 · 마감 · 견적 확인하기/ })).toBeInTheDocument();
  });

  it('마감 뒤 상담이 거절돼도 다음 PG사 상담 행동을 남긴다', () => {
    const expired = makeRfp({ code: 'P-PAST-REJECTED', title: '거절된 상담', deadline: '2020-01-01T00:00:00.000Z' });
    render(<RfpListTable rfps={[expired]} progressByRfpId={{ [expired.id]: { bidCount: 0, reviewStatus: 'rejected' } }} />);
    expect(screen.getByRole('link', { name: /거절된 상담 · 마감 · 다음 PG사 선택/ })).toBeInTheDocument();
  });
  it('행 클릭 시 상세 라우트(/rfp/<code>)로 push — 딜룸 모달 오픈 (uuid 아님)', async () => {
    const user = userEvent.setup();
    render(<RfpListTable rfps={[rfp]} />);
    await user.click(screen.getByText('결제대행 RFP'));
    expect(push).toHaveBeenCalledWith('/rfp/P-2604-0001');
  });

  it('제목 밖 행 영역을 눌러도 같은 요청을 연다', async () => {
    render(<RfpListTable rfps={[rfp]} />);
    fireEvent.click(screen.getByText('P-2604-0001'));
    expect(push).toHaveBeenCalledWith('/rfp/P-2604-0001');
  });

  it('번호 컬럼에 code를 표시', () => {
    render(<RfpListTable rfps={[rfp]} />);
    expect(screen.getByText('P-2604-0001')).toBeInTheDocument();
    expect(
      screen.queryByText('11111111-1111-1111-1111-111111111111'),
    ).not.toBeInTheDocument();
  });

  it('Enter 키로 상세 라우트(/rfp/<code>)로 push', () => {
    render(<RfpListTable rfps={[rfp, rfpSecond]} />);
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/rfp/P-2604-0002');
  });

  it('행이 2개 렌더됨', () => {
    const { container } = render(<RfpListTable rfps={[rfp, rfpSecond]} />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });
});

describe('RfpListTableSkeleton — RSC fallback 회귀 방지', () => {
  // app/(app)/rfp/page.tsx 와 rfp/loading.tsx(둘 다 서버) 가 named export
  // RfpListTableSkeleton 을 Suspense/loading fallback 으로 쓴다. 'use client'
  // 컴포넌트의 static RfpListTable.Skeleton 은 RSC 경계 너머에서 undefined 이므로
  // named export 가 standalone 으로 살아 있어야 한다. static 으로만 되돌리면 RED.
  it('standalone named export 로 존재하고 단독 렌더된다', () => {
    expect(typeof RfpListTableSkeleton).toBe('function');
    const { container } = render(<RfpListTableSkeleton />);
    expect(container.firstChild).not.toBeNull();
  });
});
