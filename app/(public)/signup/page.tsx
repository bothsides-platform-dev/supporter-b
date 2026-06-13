import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { appOrigins, signupTargetForHost } from '@/lib/site-routing';
import { safeInternalNext } from '@/lib/auth/safe-next';

/**
 * bare `/signup` 진입점. 사용자에게 역할 선택을 묻지 않고 요청 호스트로 분기한다.
 *   - partner 호스트            → /signup/pg
 *   - 그 외(buyer·단일호스트·미상) → /signup/buyer  (루트 랜딩 app/page.tsx와 동일 규칙)
 * CTA 복귀 경로(?next=)는 목적지로 전달하고, step-1 페이지가 흡수한다.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const host = (await headers()).get('host');
  const target = signupTargetForHost(host, appOrigins());

  const sp = await searchParams;
  // 첫 값만 사용한다. 배열(예: ?next=a&next=b)이나 누락은 null로 떨어뜨린다.
  const next = safeInternalNext(typeof sp.next === 'string' ? sp.next : null);

  redirect(next ? `${target}?next=${encodeURIComponent(next)}` : target);
}
