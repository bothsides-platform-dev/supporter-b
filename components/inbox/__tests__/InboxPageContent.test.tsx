import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(''),
}));

import { InboxPageContent } from '../InboxPageContent';
import type { InboxRow } from '../InboxList';
import { DemoNavProvider } from '@/lib/nav/demo-nav-context';

const deadline = new Date(Date.now() + 3 * 86_400_000).toISOString();
const rows: InboxRow[] = [
  { invitationId: 'inv-1', stage: 'received', rfpId: 'P-2611-0001', rfpTitle: '첫 요청', rfpDeadline: deadline, grade: '일반' },
  { invitationId: 'inv-2', stage: 'received', rfpId: 'P-2611-0002', rfpTitle: '둘째 요청', rfpDeadline: deadline, grade: '일반' },
];

afterEach(() => {
  cleanup();
  push.mockClear();
});

const rowOf = (title: string) => screen.getByRole('button', { name: title }).closest('tr')!;

describe('InboxPageContent 키보드 이동', () => {
  // 미리보기를 열면 서버가 그 요청을 열람 처리하고 구매사에게 보인다. 훑어보는 이동만으로는 열지 않는다.
  it('J 는 행을 강조하고 제목으로 포커스를 옮기지만 미리보기는 열지 않는다', () => {
    render(<InboxPageContent rows={rows} totalCount={2} order={rows.map((r) => r.rfpId)} />);
    fireEvent.keyDown(document, { key: 'j' });
    expect(rowOf('첫 요청')).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: '첫 요청' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'ㅓ', code: 'KeyJ' });
    expect(rowOf('둘째 요청')).toHaveAttribute('data-active', 'true');
    expect(rowOf('첫 요청')).toHaveAttribute('data-active', 'false');
    expect(screen.getByRole('button', { name: '둘째 요청' })).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it('강조한 행에서 Enter 를 누르면 그 요청의 미리보기를 연다', () => {
    render(<InboxPageContent rows={rows} totalCount={2} order={rows.map((r) => r.rfpId)} />);
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'j' });
    // 포커스가 제목 버튼에 있으면 Enter 는 버튼이 처리한다 — 같은 요청을 연다.
    fireEvent.click(document.activeElement!);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toBe('/inbox?selected=P-2611-0002&page=1');
    push.mockClear();
    // 포커스가 목록 밖이면 훅이 강조한 행을 연다.
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(push.mock.calls[0][0]).toBe('/inbox?selected=P-2611-0002&page=1');
  });

  it('E 는 강조한 요청의 견적 작성 화면을 연다', () => {
    render(<InboxPageContent rows={rows} totalCount={2} order={rows.map((r) => r.rfpId)} />);
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'e' });
    expect(push).toHaveBeenCalledWith('/inbox/P-2611-0001?tab=write', { scroll: false });
  });

  it('제목 밖 행 영역을 눌러도 미리보기를 연다', () => {
    render(<InboxPageContent rows={rows} totalCount={2} order={rows.map((r) => r.rfpId)} />);
    fireEvent.click(screen.getByText('P-2611-0002'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toBe('/inbox?selected=P-2611-0002&page=1');
  });

  it('행 안의 행동 버튼은 행 클릭으로 한 번 더 열지 않는다', () => {
    render(<InboxPageContent rows={rows} totalCount={2} order={rows.map((r) => r.rfpId)} />);
    fireEvent.click(screen.getAllByRole('button', { name: '견적 작성' })[0]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/inbox/P-2611-0001?tab=write', { scroll: false });
  });

  it('랜딩 데모에서는 문서 키를 가로채지 않는다', () => {
    const navigate = vi.fn();
    render(
      <DemoNavProvider value={{ pathname: '/inbox', search: '', navigate }}>
        <InboxPageContent rows={rows} totalCount={2} order={rows.map((r) => r.rfpId)} />
      </DemoNavProvider>,
    );
    fireEvent.keyDown(document, { key: 'j' });
    expect(rowOf('첫 요청')).toHaveAttribute('data-active', 'false');
    expect(screen.getByRole('button', { name: '첫 요청' })).not.toHaveFocus();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(navigate).not.toHaveBeenCalled();
  });
});
