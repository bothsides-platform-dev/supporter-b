// sendAdminEmail — 운영자(admin)에게 보내는 알림 메일을 Resend 로 직접 발송한다.
//
// 신규 가입 승인요청처럼 "운영자 1명(고정 주소)"에게 가는 best-effort 알림용.
// 트랜잭션 outbox(원자적·재시도)와 달리 커밋 후 fire-and-forget 경로에서 쓰이므로
// 가벼운 직접 전송으로 충분하다(누락돼도 /admin 심사 큐가 durable record).
//
// 모드 (ResendSender 와 동일 사상):
//   - ADMIN_NOTIFY_EMAIL 미설정:  전송 생략 + `[admin-email DEV]` 로그, { ok: true }
//   - RESEND_API_KEY 미설정:      dev 폴백 — `[admin-email DEV] to=... subject=...`
//                                 로그(html 제외), { ok: true }
//   - 둘 다 설정:                 Resend.emails.send 호출 → 결과 매핑

import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';

const DEFAULT_FROM = 'send@supporter-b.store';

// ADMIN_NOTIFY_EMAIL 은 ',' 로 구분된 여러 주소를 허용한다. 공백 trim 후 빈 항목 제거.
function parseRecipients(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function sendAdminEmail(args: {
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const recipients = parseRecipients(process.env.ADMIN_NOTIFY_EMAIL);
  if (recipients.length === 0) {
    console.log(
      `[admin-email DEV] no ADMIN_NOTIFY_EMAIL set; skipped subject=${args.subject}`,
    );
    return { ok: true };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // html 은 의도적으로 제외 — 공유 터미널 스크롤백에 본문/링크 노출 방지.
    console.log(`[admin-email DEV] to=${recipients.join(',')} subject=${args.subject}`);
    return { ok: true };
  }

  try {
    const client = new Resend(apiKey);
    const result = await client.emails.send({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: recipients,
      subject: args.subject,
      html: args.html,
    });

    if ('error' in result && result.error) {
      const err = result.error as { name?: string; message?: string };
      const message = err.message ?? err.name ?? 'resend_unknown_error';
      Sentry.captureException(new Error(`Admin email send failed: ${message}`), {
        extra: { context: 'admin-email', subject: args.subject },
      });
      return { ok: false, error: message };
    }

    return { ok: true };
  } catch (e) {
    Sentry.captureException(e, {
      extra: { context: 'admin-email', subject: args.subject },
    });
    return { ok: false, error: (e as Error).message ?? 'resend_threw' };
  }
}
