// 국세청 장애 시 사용자 화면에는 어떤 오류도 뜨지 않는다 — 심사자가 "이 건은
// 자동 검증이 안 됐다"를 아는 경로는 이 메일 본문과 risk flag 뿐이고, risk flag
// 렌더링은 별도 레포(admin-supporter-b) 소관이라 당장은 이 블록이 유일하다.
import { describe, expect, it } from 'vitest';

import { renderAdminSignupReview } from '../adminSignupReview';

const BASE = {
  workspaceName: '(주)샘플테크',
  orgLabel: '구매사',
  reviewUrl: 'https://admin.test/admin/review/a1',
};

describe('renderAdminSignupReview', () => {
  it('미검증 가입건에는 수동 확인 경고 블록을 렌더한다', async () => {
    const html = await renderAdminSignupReview({ ...BASE, bizUnverified: true });

    expect(html).toContain('사업자번호 자동 검증을 하지 못했습니다');
    expect(html).toContain('승인 전에 직접 확인');
    // 원인을 특정해 줘야 심사자가 "우리 시스템 버그인가?" 로 헤매지 않는다.
    expect(html).toContain('국세청');
  });

  it('검증된 가입건에는 경고 블록이 없다', async () => {
    const html = await renderAdminSignupReview({ ...BASE, bizUnverified: false });
    expect(html).not.toContain('자동 검증을 하지 못했습니다');
  });

  it('bizUnverified 미지정이면 경고 블록이 없다', async () => {
    const html = await renderAdminSignupReview(BASE);
    expect(html).not.toContain('자동 검증을 하지 못했습니다');
  });

  it('워크스페이스 이름과 심사 링크는 항상 포함한다', async () => {
    const html = await renderAdminSignupReview({ ...BASE, bizUnverified: true });
    expect(html).toContain('(주)샘플테크');
    expect(html).toContain('https://admin.test/admin/review/a1');
  });
});
