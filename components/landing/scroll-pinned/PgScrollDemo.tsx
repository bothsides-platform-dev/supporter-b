'use client';

import { ScrollDrivenDemo } from '@/components/landing/scroll-pinned/ScrollDrivenDemo';
import { PgDemoAppShell } from '@/components/landing/demo-app/PgDemoAppShell';

// 서버 컴포넌트(PgLanding)는 함수 prop을 클라 경계로 넘길 수 없다. renderDemo 함수를 이
// 클라이언트 래퍼 안에서 만들어(클라→클라) PG 데모 셸을 스크롤 pin 프레임에 연결한다.
export function PgScrollDemo() {
  return <ScrollDrivenDemo renderDemo={(p) => <PgDemoAppShell {...p} />} />;
}
