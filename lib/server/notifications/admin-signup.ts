// 신규 가입 → 운영자(admin) 이메일 승인요청 알림.
//
// 새 pending 워크스페이스/심사신청이 생기면 운영자에게 이메일을 보낸다. 외부 발송은
// DB 트랜잭션 밖, 커밋 성공 후 fire-and-forget 으로 처리한다 — `next/server` 의
// `after()` + try/catch(요청 스코프 밖이면 no-op) 구조(post-commit.ts 패턴). best-effort
// 알림이며 실패해도 /admin 심사 큐가 durable record 이므로 액션 에러로 표면화하지 않는다.

import { after } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { sendAdminEmail } from '@/lib/integrations/admin-email';
import { renderAdminSignupReview } from '@/lib/server/outbox/templates/adminSignupReview';

export type AdminSignupNotice = {
  workspaceName: string;
  orgType: 'buyer' | 'pg';
  reviewUrl: string;
};

const ORG_LABEL: Record<AdminSignupNotice['orgType'], string> = {
  buyer: '구매사',
  pg: '결제대행사',
};

export function buildAdminSignupSubject(notice: AdminSignupNotice): string {
  return `[Supporter B] 새 입점 심사 요청 — ${notice.workspaceName} (${ORG_LABEL[notice.orgType]})`;
}

export function notifyAdminNewSignupAfterCommit(notice: AdminSignupNotice): void {
  try {
    after(async () => {
      try {
        const html = await renderAdminSignupReview({
          workspaceName: notice.workspaceName,
          orgLabel: ORG_LABEL[notice.orgType],
          reviewUrl: notice.reviewUrl,
        });
        await sendAdminEmail({ subject: buildAdminSignupSubject(notice), html });
      } catch (err) {
        Sentry.captureException(err, {
          extra: { context: 'admin-signup-notify' },
        });
      }
    });
  } catch {
    // 요청 스코프 밖(예: vitest) — no-op. 실제 발송은 수동 검증으로 확인한다.
  }
}
