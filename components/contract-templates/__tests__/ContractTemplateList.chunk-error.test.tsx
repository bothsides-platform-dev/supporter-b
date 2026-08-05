// 에디터 동적 청크 로드 실패 회귀 가드 — React.lazy 는 rejection 을 캐시하므로
// 로컬 바운더리 없이는 전역 에러 화면(app/(app)/error.tsx)으로 떨어지고, 그 화면의
// 재시도는 캐시된 rejection 을 다시 던져 하드 리로드 말고는 출구가 없다.
// (대표 트리거: 배포가 .next 를 제자리 재빌드해 열린 탭의 옛 content-hash 청크가 404)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/server/actions/signing/deleteSigningTemplateAction', () => ({
  deleteSigningTemplateAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/renameSigningTemplateAction', () => ({
  renameSigningTemplateAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/listSigningTemplatesAction', () => ({
  listSigningTemplatesAction: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

// 청크 로드 실패 재현. vitest 는 mock 된 모듈의 동적 import 를 reject 시키지 못한다
// (throw 하는 팩토리는 sync/async 모두 import 를 pending 으로 남긴다 — 실측). React 는
// lazy rejection 을 해당 엘리먼트 위치의 렌더 throw 로 표면화하므로, 같은 지점에서
// 던지는 컴포넌트로 동일 메커니즘을 재현한다(바운더리가 보는 것은 동일하다).
vi.mock('../ContractTemplateEditor', () => ({
  ContractTemplateEditor: () => {
    throw new Error('Failed to fetch dynamically imported module');
  },
}));

import { ContractTemplateList } from '../ContractTemplateList';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ContractTemplateList — 에디터 청크 로드 실패', () => {
  it('전역 에러로 던지지 않고 로컬 에러 표면 + 새로고침 버튼을 그린다', async () => {
    // React 에러 바운더리 경로는 console.error 소음을 낸다 — 단언과 무관.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    render(<ContractTemplateList initialTemplates={[]} />);
    await user.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));

    expect(
      await screen.findByText(/에디터를 불러오지 못했어요/),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy();
  });
});
