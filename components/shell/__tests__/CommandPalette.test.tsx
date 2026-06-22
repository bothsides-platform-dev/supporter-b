import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// cmdk reads ResizeObserver on mount; jsdom doesn't implement it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
// cmdk scrolls the active item into view; jsdom doesn't implement it.
Element.prototype.scrollIntoView = vi.fn();

const { searchEntitiesMock, pushMock } = vi.hoisted(() => ({
  searchEntitiesMock: vi.fn(),
  pushMock: vi.fn(),
}));
vi.mock('@/lib/server/actions/search/searchEntitiesAction', () => ({
  searchEntitiesAction: (q: string) => searchEntitiesMock(q),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { CommandPalette } from '../CommandPalette';
import { useUIStore } from '@/lib/stores/ui';

const EMPTY = { rfps: [], bids: [], opportunities: [] };

beforeEach(() => {
  searchEntitiesMock.mockReset();
  searchEntitiesMock.mockResolvedValue(EMPTY);
  pushMock.mockReset();
});

afterEach(() => {
  useUIStore.setState({ commandPaletteOpen: false });
});

describe('CommandPalette — workspace-scoped nav commands', () => {
  it('buyer: shows RFP destinations (G then C keycaps) and no pg-only items', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="buyer" />);

    expect(screen.getByText('새 견적 요청')).toBeInTheDocument();
    // G then C chord keycaps for new-RFP (platform-independent)
    expect(screen.getAllByText('G').length).toBeGreaterThan(0);
    expect(screen.getByText('C')).toBeInTheDocument();
    // pg-only destinations must not leak into a buyer palette
    expect(screen.queryByText('참여 가능한 견적')).not.toBeInTheDocument();
    expect(screen.queryByText('견적 템플릿')).not.toBeInTheDocument();
  });

  it('pg: shows 참여 가능한 견적 + 견적 템플릿 and no buyer-only new-RFP', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="pg" />);

    expect(screen.getByText('참여 가능한 견적')).toBeInTheDocument();
    expect(screen.getByText('견적 템플릿')).toBeInTheDocument();
    expect(screen.queryByText('새 견적 요청')).not.toBeInTheDocument();
  });
});

describe('CommandPalette — server entity search rendering', () => {
  it('buyer: typing a query renders grouped RFP + bid results from the server', async () => {
    searchEntitiesMock.mockResolvedValue({
      rfps: [
        { code: 'P-2605-0001', title: '수수료 인하 문의', memo: '긴급', status: 'sent', href: '/rfp/P-2605-0001' },
      ],
      bids: [
        { bidId: 'b1', rfpId: 'P-2605-0001', rfpTitle: '수수료 인하 문의', pgWsName: '토스페이먼츠', memo: '협의 가능', href: '/rfp/P-2605-0001' },
      ],
      opportunities: [],
    });

    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="buyer" />);

    fireEvent.change(screen.getByPlaceholderText('검색...'), {
      target: { value: '수수료' },
    });

    // debounced server search resolves → grouped sections render
    expect(await screen.findByText('견적 요청')).toBeInTheDocument();
    expect(await screen.findByText('견적서')).toBeInTheDocument();
    expect(screen.getByText('토스페이먼츠')).toBeInTheDocument();
    expect(screen.getByText('협의 가능')).toBeInTheDocument();
    expect(searchEntitiesMock).toHaveBeenCalledWith('수수료');
  });

  it('pg: typing a query renders 참여 가능한 견적 results', async () => {
    searchEntitiesMock.mockResolvedValue({
      rfps: [],
      bids: [],
      opportunities: [
        { rfpCode: 'P-2605-0050', buyerName: '구매사A', title: '신규 입찰 건', websiteUrl: null, href: '/opportunities' },
      ],
    });

    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="pg" />);

    fireEvent.change(screen.getByPlaceholderText('검색...'), {
      target: { value: '입찰' },
    });

    expect(await screen.findByText('신규 입찰 건')).toBeInTheDocument();
    expect(screen.getByText('구매사A')).toBeInTheDocument();
  });
});

describe('CommandPalette — 초성 검색 (nav commands)', () => {
  it('ㅇㄹ 초성 입력 시 알림 항목이 노출되고 홈은 숨겨짐', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="buyer" />);

    fireEvent.change(screen.getByPlaceholderText('검색...'), {
      target: { value: 'ㅇㄹ' },
    });

    // 알림(ㅇ=알, ㄹ=림) 은 ㅇㄹ에 매칭
    expect(screen.getByText('알림')).toBeInTheDocument();
    // 홈(ㅎ)은 ㅇㄹ에 매칭 안 됨
    expect(screen.queryByText('홈')).not.toBeInTheDocument();
    // 새 견적 요청(ㅅ ㄱㅈ ㅇㅊ)은 ㅇㄹ 연속이 없으므로 숨겨짐
    expect(screen.queryByText('새 견적 요청')).not.toBeInTheDocument();
  });

  it('ㅎ 초성 입력 시 홈 항목이 노출되고 알림은 숨겨짐', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="buyer" />);

    fireEvent.change(screen.getByPlaceholderText('검색...'), {
      target: { value: 'ㅎ' },
    });

    expect(screen.getByText('홈')).toBeInTheDocument();
    // 알림(ㅇㄹ)은 ㅎ 포함 안 함
    expect(screen.queryByText('알림')).not.toBeInTheDocument();
  });
});

describe('CommandPalette — 계정 그룹 (설정·로그아웃)', () => {
  const setupAssignMock = () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock },
    });
    return assignMock;
  };

  it('기본 상태에서 계정 그룹에 설정과 로그아웃이 렌더된다', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="buyer" />);

    expect(screen.getByText('계정')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '설정' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '로그아웃' })).toBeInTheDocument();
  });

  it('초성 "ㅅㅈ" 타이핑 시 설정 항목이 계정 그룹에 매칭된다 (choseong 검색)', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="buyer" />);

    fireEvent.change(screen.getByPlaceholderText('검색...'), {
      target: { value: 'ㅅㅈ' },
    });

    expect(screen.getByRole('option', { name: '설정' })).toBeInTheDocument();
  });

  it('"설정" 타이핑 시 설정 항목이 계정 그룹에 매칭된다 (이전 회귀: 결과 없음)', () => {
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="buyer" />);

    fireEvent.change(screen.getByPlaceholderText('검색...'), {
      target: { value: '설정' },
    });

    expect(screen.getByRole('option', { name: '설정' })).toBeInTheDocument();
  });

  it('설정 선택 시 /settings/profile 로 라우터 push가 호출된다', () => {
    const assignMock = setupAssignMock();
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="buyer" />);

    fireEvent.click(screen.getByRole('option', { name: '설정' }));

    // router.push('/settings/profile') 가 호출되어야 한다
    expect(pushMock).toHaveBeenCalledWith('/settings/profile');
    // window.location.assign 은 호출되지 않아야 한다 (로그아웃 경로 아님)
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('로그아웃 선택 시 확인 패널이 표시되고 window.location.assign은 아직 미호출', () => {
    setupAssignMock();
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="buyer" />);

    fireEvent.click(screen.getByRole('option', { name: '로그아웃' }));

    // 확인 패널: 확인 질문 텍스트가 보여야 한다
    expect(screen.getByText('로그아웃할까요?')).toBeInTheDocument();
    // 아직 실제 로그아웃 미실행
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('확인 패널에서 로그아웃 선택 시 window.location.assign("/logout") 호출', () => {
    const assignMock = setupAssignMock();
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="buyer" />);

    // 로그아웃 선택 → 확인 패널
    fireEvent.click(screen.getByRole('option', { name: '로그아웃' }));
    // 확인 패널의 로그아웃 확인 버튼 클릭
    fireEvent.click(screen.getByRole('option', { name: '로그아웃' }));

    expect(assignMock).toHaveBeenCalledWith('/logout');
  });

  it('확인 패널에서 취소 선택 시 평상 목록으로 복귀하고 네비 미발생', () => {
    const assignMock = setupAssignMock();
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="buyer" />);

    // 로그아웃 선택 → 확인 패널
    fireEvent.click(screen.getByRole('option', { name: '로그아웃' }));
    expect(screen.getByText('로그아웃할까요?')).toBeInTheDocument();

    // 취소 선택
    fireEvent.click(screen.getByRole('option', { name: '취소' }));

    // 평상 목록 복귀 — 계정 그룹 다시 보임
    expect(screen.getByRole('option', { name: '설정' })).toBeInTheDocument();
    expect(assignMock).not.toHaveBeenCalled();
  });
});
