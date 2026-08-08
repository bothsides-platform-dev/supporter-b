// /contract-templates kill switch 가드 — 플래그가 꺼진 동안의 페이지 계약.
//
// 주의: @/lib/features/contract-templates 를 mock 하지 않음 — 실제 플래그를 사용.
// 플래그를 true 로 re-enable 할 때는 이 파일을 삭제한다.
//
// 두 가지를 못박는다:
//  ① 목록 조회(listSigningTemplatesAction)를 **아예 만들지 않는다**. 안내 화면을
//     그리면서 뒤로 조회를 날리면 숨긴 기능의 데이터가 계속 오간다.
//  ② 플래그 분기가 pg ACL 가드를 **앞지르지 않는다**. 순서가 뒤집히면 구매사도
//     PG 전용 화면 셸을 보게 된다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    // 실제 next/navigation redirect() 처럼 throw 하여 실행을 중단시킨다.
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const mockAuth = vi.hoisted(() => vi.fn());
const mockList = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/server/actions/signing/listSigningTemplatesAction', () => ({
  listSigningTemplatesAction: mockList,
}));
vi.mock('@/components/contract-templates/ContractTemplateList', () => ({
  ContractTemplateList: () => null,
}));

import ContractTemplatesPage from '../page';

describe('ContractTemplatesPage — kill switch (flag off)', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockAuth.mockReset();
    mockList.mockReset();
    mockList.mockResolvedValue({ ok: true, templates: [] });
  });

  it('PG 세션이어도 템플릿 목록을 조회하지 않고 안내 화면을 그린다', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'u-1', workspaceId: 'ws-1', workspaceType: 'pg' },
    });

    await ContractTemplatesPage();

    expect(mockList).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('구매사 세션은 플래그와 무관하게 먼저 /home 으로 보낸다 (ACL 가드가 앞)', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'u-1', workspaceId: 'ws-1', workspaceType: 'buyer' },
    });

    await expect(ContractTemplatesPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/home');
    expect(mockList).not.toHaveBeenCalled();
  });

  it('미인증 세션은 /login?next=/contract-templates 로 보낸다', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(ContractTemplatesPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login?next=/contract-templates');
    expect(mockList).not.toHaveBeenCalled();
  });
});
