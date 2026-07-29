// buildAdminSignupSubject — 운영자 알림 메일 제목 빌더 (순수 함수).
import { describe, expect, it } from 'vitest';

import { buildAdminSignupSubject } from '../admin-signup';

describe('buildAdminSignupSubject', () => {
  it('includes the workspace name and 구매사 label for a buyer', () => {
    const subject = buildAdminSignupSubject({
      workspaceName: '바이딧 주식회사',
      orgType: 'buyer',
      reviewUrl: 'https://x.test/admin/review/a1',
    });
    expect(subject).toContain('바이딧 주식회사');
    expect(subject).toContain('구매사');
  });

  it('labels a pg workspace as PG사 (matching the admin review UI)', () => {
    const subject = buildAdminSignupSubject({
      workspaceName: 'KG이니시스',
      orgType: 'pg',
      reviewUrl: 'https://x.test/admin/review/a2',
    });
    expect(subject).toContain('KG이니시스');
    expect(subject).toContain('PG사');
  });

  // 국세청 장애로 자동 검증을 건너뛴 가입건은 승인 전에 사람이 확인해야 한다.
  // 사용자에게는 아무 오류도 보이지 않으므로, 이 배지가 운영자에게 그 사실을
  // 전달하는 **유일하게 도달이 보장된 채널**이다 (risk flag 렌더링은 별도 레포).
  it('flags an unverified bizNo in the subject', () => {
    const subject = buildAdminSignupSubject({
      workspaceName: '바이딧 주식회사',
      orgType: 'buyer',
      reviewUrl: 'https://x.test/admin/review/a3',
      bizVerified: false,
    });
    expect(subject).toContain('사업자번호 미검증');
  });

  it('does not flag a verified signup', () => {
    const subject = buildAdminSignupSubject({
      workspaceName: '바이딧 주식회사',
      orgType: 'buyer',
      reviewUrl: 'https://x.test/admin/review/a4',
      bizVerified: true,
    });
    expect(subject).not.toContain('미검증');
  });

  // bizVerified 미지정(레거시 호출부)은 배지를 붙이지 않는다 — 배지가 붙으면
  // 그건 진짜 미검증이라는 뜻이어야 신뢰할 수 있다.
  it('omits the flag when bizVerified is not provided', () => {
    const subject = buildAdminSignupSubject({
      workspaceName: '바이딧 주식회사',
      orgType: 'buyer',
      reviewUrl: 'https://x.test/admin/review/a5',
    });
    expect(subject).not.toContain('미검증');
  });
});
