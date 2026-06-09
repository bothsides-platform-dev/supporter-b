import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: ({ counterparty }: { counterparty: { name: string } }) => (
    <span>{counterparty.name}</span>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/hooks/useLazyPgWorkspaces', () => ({
  useLazyPgWorkspaces: () => ({ pgList: [], loading: false, error: null, load: vi.fn() }),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/server/actions/rfp', () => ({
  addPgWorkspacesToRfpAction: vi.fn(),
  sendDraftInvitationsAction: vi.fn(),
}));

import { RfpInviteManager, chosungCommandFilter } from '../RfpInviteManager';

afterEach(cleanup);

describe('RfpInviteManager', () => {
  it('canEdit=true 여도 공유 링크 섹션이 노출되지 않는다', () => {
    render(
      <RfpInviteManager
        rfpId="rfp-1"
        invitations={[]}
        canEdit={true}
      />,
    );
    expect(screen.queryByText('공유 링크')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '복사' })).not.toBeInTheDocument();
  });
});

describe('chosungCommandFilter', () => {
  it('초성 입력으로 일치하는 한국어 이름은 1을 반환한다', () => {
    // 나이스(ㄴㅇㅅ): 나이스페이먼츠만 매칭, 토스·한국정보통신은 미매칭
    expect(chosungCommandFilter('나이스페이먼츠', 'ㄴㅇㅅ')).toBe(1);
    expect(chosungCommandFilter('한국정보통신', 'ㅎㄱ')).toBe(1);
  });

  it('초성이 포함되지 않는 이름은 0을 반환한다', () => {
    expect(chosungCommandFilter('토스페이먼츠', 'ㄴㅇㅅ')).toBe(0);
    expect(chosungCommandFilter('나이스페이먼츠', 'ㅎㄱ')).toBe(0);
  });

  it('부분 문자열 검색도 동작한다', () => {
    expect(chosungCommandFilter('토스페이먼츠', '토스')).toBe(1);
    expect(chosungCommandFilter('KG이니시스', 'KG')).toBe(1);
  });

  it('대소문자를 구분하지 않는다', () => {
    expect(chosungCommandFilter('KG이니시스', 'kg')).toBe(1);
  });

  it('빈 검색어는 모든 항목을 표시한다', () => {
    expect(chosungCommandFilter('토스페이먼츠', '')).toBe(1);
    expect(chosungCommandFilter('한국정보통신', '')).toBe(1);
  });
});
