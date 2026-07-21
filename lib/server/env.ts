import type { WorkspaceType } from '@/lib/types/workspace';
import { baseUrl } from '@/lib/site-routing';

// 폴백 사슬의 단일 출처는 lib/site-routing.ts 다 — 호스트 라우팅에 쓰는 appOrigins 와
// 같은 답을 내야 하기 때문. site-routing 은 클라이언트에서도 쓰여 이쪽을 참조할 수 없으므로
// 방향이 이렇게 잡혀 있다. 기존 호출처 호환을 위해 여기서 그대로 재export 한다.
export { baseUrl };

/** Absolute origin for the admin console (admin.support-b.com). */
export function adminBaseUrl(): string {
  return process.env.ADMIN_ORIGIN ?? baseUrl();
}

/** Absolute origin for links shown to a given workspace type (partner subdomain for pg). */
export function baseUrlFor(type: WorkspaceType): string {
  const origin =
    type === 'pg'
      ? process.env.NEXT_PUBLIC_PARTNER_ORIGIN
      : process.env.NEXT_PUBLIC_BUYER_ORIGIN;
  return origin ?? baseUrl();
}
