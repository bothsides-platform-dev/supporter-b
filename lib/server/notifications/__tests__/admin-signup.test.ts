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

  it('labels a pg workspace as 결제대행사', () => {
    const subject = buildAdminSignupSubject({
      workspaceName: 'KG이니시스',
      orgType: 'pg',
      reviewUrl: 'https://x.test/admin/review/a2',
    });
    expect(subject).toContain('KG이니시스');
    expect(subject).toContain('결제대행사');
  });
});
