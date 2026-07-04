import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
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

beforeEach(() => {
  searchEntitiesMock.mockReset();
  pushMock.mockReset();
});
afterEach(() => {
  useUIStore.setState({ commandPaletteOpen: false });
});

describe('CommandPalette — open board disabled (flag off)', () => {
  it('pg: opportunities 검색 결과가 와도 "참여 가능한 견적" 그룹을 렌더하지 않는다', async () => {
    searchEntitiesMock.mockResolvedValue({
      rfps: [],
      bids: [],
      opportunities: [
        { rfpCode: 'P-2605-0050', buyerName: '구매사A', title: '신규 입찰 건', websiteUrl: null, href: '/opportunities' },
      ],
    });
    useUIStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette workspaceType="pg" />);
    fireEvent.change(screen.getByPlaceholderText('검색...'), { target: { value: '입찰' } });
    // 디바운스 후에도 그룹이 나타나지 않아야 한다.
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByText('참여 가능한 견적')).not.toBeInTheDocument();
    expect(screen.queryByText('신규 입찰 건')).not.toBeInTheDocument();
  });
});
