// HTTP 요청 컨텍스트(ip + user-agent) 캡처 — 전자계약 액션의 감사추적
// (contract_doc_events.ip/userAgent, 서명 컨센트 스탬프) 단일 캡처 지점.
// clientIp() 미러(lib/server/actions/auth/loginAction.ts:25-35) + user-agent 동봉.
import { headers } from 'next/headers';
import type { RequestMeta } from '@/lib/server/services/contract';

export type { RequestMeta };

/**
 * Caddy가 얹는 x-forwarded-for(우선) 또는 x-real-ip에서 클라이언트 IP를,
 * user-agent 헤더를 그대로 읽는다. 요청 스코프 밖(단위 테스트 등)이면 둘 다 null.
 */
export async function getRequestMeta(): Promise<RequestMeta> {
  try {
    const h = await headers();
    const xff = h.get('x-forwarded-for');
    const ip = xff ? xff.split(',')[0]!.trim() || null : h.get('x-real-ip');
    return { ip, userAgent: h.get('user-agent') };
  } catch {
    return { ip: null, userAgent: null };
  }
}
