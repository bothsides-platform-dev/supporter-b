// sendDiscordMessage — 운영자 디스코드 채널로 웹훅 메시지를 직접 발송한다.
//
// 전자서명 라이프사이클 알림처럼 "운영자 채널 1곳"에 가는 best-effort 알림용.
// 트랜잭션 outbox(원자적·재시도)와 달리 커밋 후 fire-and-forget 경로에서 쓰이므로
// 가벼운 직접 전송으로 충분하다(누락돼도 인앱 알림·감사 로그가 durable record).
// admin-email.ts 와 같은 사상, 전송만 Discord webhook.
//
// 모드:
//   - DISCORD_WEBHOOK_URL 미설정/빈값: 전송 생략 + `[discord DEV]` 로그, { ok: true }
//   - 설정:                            웹훅 URL 로 JSON POST({ content }) → 결과 매핑
//
// never throws — 실패는 { ok: false } + Sentry 로만 표면화한다.

import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/observability/logger';

const SEND_TIMEOUT_MS = 3_000;
// Discord 웹훅 content 상한(2000자). 초과분은 잘라 보낸다 — best-effort 알림이
// 400 으로 통째로 유실되는 것보다 낫다.
const CONTENT_MAX = 2_000;

export async function sendDiscordMessage(args: {
  content: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    // 내용 전문은 의도적으로 제외 — 공유 터미널 스크롤백 노출 방지.
    console.log(
      `[discord DEV] no DISCORD_WEBHOOK_URL set; skipped content=${args.content.slice(0, 40)}`,
    );
    return { ok: true };
  }

  try {
    const t0 = Date.now();
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: args.content.slice(0, CONTENT_MAX),
        // 멘션 파싱 차단 — content 에 사용자 입력(RFP 제목)이 섞이므로 "@everyone"
        // 이 들어와도 채널 전체 핑이 되지 않게 한다.
        allowed_mentions: { parse: [] },
      }),
      // 행이 멈춘 Discord 가 호출자를 무기한 붙들지 않도록 짧은 타임아웃.
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      Sentry.captureException(new Error(`Discord webhook send failed: HTTP ${res.status}`), {
        extra: { context: 'discord', status: res.status },
      });
      return { ok: false, error: `http_${res.status}` };
    }
    logger.info('discord.sent', { durationMs: Date.now() - t0 });
    return { ok: true };
  } catch (e) {
    Sentry.captureException(e, { extra: { context: 'discord' } });
    return { ok: false, error: (e as Error).message ?? 'discord_threw' };
  }
}
