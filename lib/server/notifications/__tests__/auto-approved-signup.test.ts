import { expect, it } from 'vitest';
import { buildAdminSignupSlackText, buildAdminSignupSubject } from '../admin-signup';
import { renderAdminSignupReview } from '@/lib/server/outbox/templates/adminSignupReview';

it('automatic approval notices say completed and retain the guest summary', async () => {
  const notice = {
    workspaceName: '자동 구매사', orgType: 'buyer' as const,
    reviewUrl: 'https://admin.example/review/id', autoApproved: true,
    guestDraft: { answers: { websiteUrl: 'https://shop.example' }, files: [{ name: '견적.pdf', size: 1234 }] },
  };
  const text = buildAdminSignupSlackText(notice);
  expect(text).toContain('자동 승인 완료');
  expect(text).toContain('https://shop.example');
  expect(text).toContain('견적.pdf (1234 bytes)');
  expect(text).not.toContain('새 입점 심사 요청');
  expect(buildAdminSignupSubject(notice)).toContain('자동 승인 완료');
  const html = await renderAdminSignupReview({ workspaceName: notice.workspaceName, orgLabel: '구매사', reviewUrl: notice.reviewUrl, autoApproved: true });
  expect(html).toContain('자동 승인 완료');
  expect(html).not.toContain('심사를 기다리고');
  expect(html).not.toContain('심사하러 가기');
});
