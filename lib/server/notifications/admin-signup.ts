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
import { renderAdminMembershipReview } from '@/lib/server/outbox/templates/adminMembershipReview';

export type AdminSignupNotice = {
  workspaceName: string;
  orgType: 'buyer' | 'pg';
  reviewUrl: string;
  /**
   * 사업자번호가 국세청 조회로 확인됐는가. `false` 면 제목·본문에 경고를 붙인다.
   *
   * 국세청 장애 시 사용자에게는 오류를 일절 보이지 않고 가입을 통과시키므로,
   * 이 배지가 "승인 전에 사람이 확인해야 한다"를 운영자에게 전달하는 **도달이
   * 보장된 유일한 채널**이다 (risk flag 렌더링은 별도 레포 `admin-supporter-b`).
   * 미지정은 배지 없음 — 배지가 붙으면 진짜 미검증이어야 신뢰할 수 있다.
   */
  bizVerified?: boolean;
};

// admin review UI(대시보드·심사 페이지)와 동일 라벨을 사용한다 — 운영자가 메일과
// 클릭 후 도착 화면에서 같은 용어를 보도록(dashboard.ts / review 페이지: buyer→구매사, pg→PG사).
const ORG_LABEL: Record<AdminSignupNotice['orgType'], string> = {
  buyer: '구매사',
  pg: 'PG사',
};

export function buildAdminSignupSubject(notice: AdminSignupNotice): string {
  const flag = notice.bizVerified === false ? ' ⚠ 사업자번호 미검증' : '';
  return `[서포트비] 새 입점 심사 요청 — ${notice.workspaceName} (${ORG_LABEL[notice.orgType]})${flag}`;
}

export function notifyAdminNewSignupAfterCommit(notice: AdminSignupNotice): void {
  try {
    after(async () => {
      try {
        const html = await renderAdminSignupReview({
          workspaceName: notice.workspaceName,
          orgLabel: ORG_LABEL[notice.orgType],
          reviewUrl: notice.reviewUrl,
          bizUnverified: notice.bizVerified === false,
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

export type AdminMembershipNotice = {
  userName: string;
  workspaceName: string;
  reviewUrl: string;
};

export function buildAdminMembershipSubject(notice: AdminMembershipNotice): string {
  return `[서포트비] PG사 계정 합류 심사 요청 — ${notice.userName} (${notice.workspaceName})`;
}

export function notifyAdminNewMembershipAfterCommit(notice: AdminMembershipNotice): void {
  try {
    after(async () => {
      try {
        const html = await renderAdminMembershipReview({
          userName: notice.userName,
          workspaceName: notice.workspaceName,
          reviewUrl: notice.reviewUrl,
        });
        await sendAdminEmail({ subject: buildAdminMembershipSubject(notice), html });
      } catch (err) {
        Sentry.captureException(err, {
          extra: { context: 'admin-membership-notify' },
        });
      }
    });
  } catch {
    // 요청 스코프 밖(예: vitest) — no-op.
  }
}
