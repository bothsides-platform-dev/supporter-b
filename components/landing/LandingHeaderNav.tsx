'use client';

import { LandingNav } from '@/components/landing/LandingNav';
import { useSessionAuthed } from '@/components/landing/use-session-authed';

// force-static 랜딩(app/page.tsx)이 빌드 타임에 프리렌더되므로 서버 auth()는 쓸 수
// 없다 — 클라이언트에서 세션을 조회해 로그인 상태별 표시를 유지한다.
export function LandingHeaderNav() {
  const authed = useSessionAuthed();
  return <LandingNav authed={authed} />;
}
