// 신규 가입 → 운영자(admin) 승인요청 알림. 슬랙 + 이메일 **두 채널**로 나간다.
//
// 새 pending 워크스페이스/심사신청이 생기면 운영자에게 알린다. 외부 발송은
// DB 트랜잭션 밖, 커밋 성공 후 fire-and-forget 으로 처리한다 — `next/server` 의
// `after()` + try/catch(요청 스코프 밖이면 no-op) 구조(post-commit.ts 패턴). best-effort
// 알림이며 실패해도 /admin 심사 큐가 durable record 이므로 액션 에러로 표면화하지 않는다.
//
// 두 채널의 팬아웃 구조(슬랙 먼저 + 채널별 독립 가드)는 `fanOutToOperator` 한 곳이
// 소유한다 — 그 이유는 거기 JSDoc 에 있다.

import { after } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { sendAdminEmail } from '@/lib/integrations/admin-email';
import { escapeSlackText, sendSlackMessage } from '@/lib/integrations/slack';
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
   *
   * 슬랙 본문도 **같은 배지를 단다** — 채널이 늘었다고 경고가 약해지면 안 된다.
   */
  bizVerified?: boolean;
};

// admin review UI(대시보드·심사 페이지)와 동일 라벨을 사용한다 — 운영자가 메일과
// 클릭 후 도착 화면에서 같은 용어를 보도록(dashboard.ts / review 페이지: buyer→구매사, pg→PG사).
const ORG_LABEL: Record<AdminSignupNotice['orgType'], string> = {
  buyer: '구매사',
  pg: 'PG사',
};

const UNVERIFIED_FLAG = ' ⚠ 사업자번호 미검증';

/**
 * 두 채널 팬아웃의 **유일한** 구현. 가입·멤버십이 이 구조를 각자 복제하고 있었는데,
 * 그러면 "채널별 독립 가드" 불변식을 사람이 두 곳에서 손으로 지켜야 한다.
 *
 * 가드가 둘인 이유: 한 채널의 실패가 다른 채널을 삼키면 안 된다. 특히 이메일 템플릿
 * 렌더는 이 콜백에서 가장 느리고 가장 잘 깨지는 단계라, 단일 가드였을 때는 렌더가
 * 던지는 순간 슬랙까지 함께 죽었다. 슬랙을 먼저 보내는 것도 같은 이유다(운영자가
 * 실시간으로 보는 채널이고, 본문 조립이 순수 문자열이라 던질 일이 없다).
 *
 * 바깥 try/catch 는 요청 스코프 밖에서 `after()` 자체가 던지는 경우(예: vitest)를 받는다.
 */
function fanOutToOperator(args: {
  slackText: string;
  subject: string;
  renderHtml: () => Promise<string>;
  contextPrefix: string;
}): void {
  try {
    after(async () => {
      try {
        await sendSlackMessage({ text: args.slackText });
      } catch (err) {
        Sentry.captureException(err, { extra: { context: `${args.contextPrefix}-slack` } });
      }

      try {
        const html = await args.renderHtml();
        await sendAdminEmail({ subject: args.subject, html });
      } catch (err) {
        Sentry.captureException(err, { extra: { context: `${args.contextPrefix}-notify` } });
      }
    });
  } catch {
    // 요청 스코프 밖(예: vitest) — no-op. 실제 발송은 수동 검증으로 확인한다.
  }
}

export function buildAdminSignupSubject(notice: AdminSignupNotice): string {
  const flag = notice.bizVerified === false ? UNVERIFIED_FLAG : '';
  return `[서포트비] 새 입점 심사 요청 — ${notice.workspaceName} (${ORG_LABEL[notice.orgType]})${flag}`;
}

/**
 * 순수 슬랙 본문 빌더.
 *
 * `workspaceName` 은 가입자 자유 입력이라 `escapeSlackText` 를 통과시킨다 — 슬랙
 * Incoming Webhook 에는 멘션 차단 필드가 없어서, 그 이스케이프가 상호에 심어진
 * `<!channel>` 이 운영 채널을 핑하는 것을 막는 유일한 수단이다.
 *
 * `reviewUrl` 은 `adminBaseUrl()` + UUID 조립값이라 이스케이프하지 않고 **맨 URL 로**
 * 둔다(슬랙이 알아서 자동 링크한다). 손으로 `<url|문구>` 를 조립하지 않는 것은 의도적
 * 이다 — 형제 인자들이 이스케이프되는 함수 안에 꺾쇠 조립이 섞여 있으면, 나중에
 * 누군가 거기에 사용자 문자열을 넣는 함정이 된다.
 */
export function buildAdminSignupSlackText(notice: AdminSignupNotice): string {
  const flag = notice.bizVerified === false ? UNVERIFIED_FLAG : '';
  const name = escapeSlackText(notice.workspaceName);
  return `📥 [가입] 새 입점 심사 요청 — ${name} (${ORG_LABEL[notice.orgType]})${flag}\n${notice.reviewUrl}`;
}

export function notifyAdminNewSignupAfterCommit(notice: AdminSignupNotice): void {
  fanOutToOperator({
    slackText: buildAdminSignupSlackText(notice),
    subject: buildAdminSignupSubject(notice),
    renderHtml: () =>
      renderAdminSignupReview({
        workspaceName: notice.workspaceName,
        orgLabel: ORG_LABEL[notice.orgType],
        reviewUrl: notice.reviewUrl,
        bizUnverified: notice.bizVerified === false,
      }),
    contextPrefix: 'admin-signup',
  });
}

export type AdminMembershipNotice = {
  userName: string;
  workspaceName: string;
  reviewUrl: string;
};

export function buildAdminMembershipSubject(notice: AdminMembershipNotice): string {
  return `[서포트비] PG사 계정 합류 심사 요청 — ${notice.userName} (${notice.workspaceName})`;
}

/** 순수 슬랙 본문 빌더 — 이스케이프 규칙은 buildAdminSignupSlackText 와 같다. */
export function buildAdminMembershipSlackText(notice: AdminMembershipNotice): string {
  const user = escapeSlackText(notice.userName);
  const workspace = escapeSlackText(notice.workspaceName);
  return `📥 [가입] PG사 계정 합류 심사 요청 — ${user} (${workspace})\n${notice.reviewUrl}`;
}

export function notifyAdminNewMembershipAfterCommit(notice: AdminMembershipNotice): void {
  fanOutToOperator({
    slackText: buildAdminMembershipSlackText(notice),
    subject: buildAdminMembershipSubject(notice),
    renderHtml: () =>
      renderAdminMembershipReview({
        userName: notice.userName,
        workspaceName: notice.workspaceName,
        reviewUrl: notice.reviewUrl,
      }),
    contextPrefix: 'admin-membership',
  });
}
