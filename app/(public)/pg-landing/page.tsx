import { PgLanding } from '@/components/landing/PgLanding';

// partner(PG) 호스트의 "/" 는 proxy.ts 의 decideRoute rewrite 로 이 라우트에 내부적으로
// 도달한다(URL은 "/" 그대로 유지). 정적 프리렌더 대상이라 요청별 분기 로직을 두지 않는다.
export const dynamic = 'force-static';

export default function PgLandingPage() {
  return <PgLanding />;
}
