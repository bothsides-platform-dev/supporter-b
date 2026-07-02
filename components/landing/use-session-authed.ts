'use client';

import useSWR from 'swr';

// static(force-static) 랜딩 헤더가 로그인 상태를 반영하기 위한 클라이언트 세션 조회.
// 랜딩 페이지는 빌드 타임에 프리렌더되므로 서버 auth()는 항상 "비로그인"으로 고정된다.
// 대신 next-auth 기본 엔드포인트(JWT 전략이라 쿠키만으로 응답)를 마운트 후 fetch해
// 실제 로그인 상태로 헤더를 갱신한다. proxy.ts가 /api/* 를 항상 통과시키므로
// 비인증 방문자도 이 엔드포인트에 접근 가능하다.
//
// SWR이 같은 키('/api/auth/session')를 쓰는 모든 소비자(LandingHeaderNav,
// PgLandingHeaderNav)의 요청을 자동으로 중복 제거·캐시 공유한다.
type SessionResponse = { user?: unknown } | null;

async function sessionFetcher(url: string): Promise<SessionResponse> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export function useSessionAuthed(): boolean {
  const { data } = useSWR<SessionResponse>('/api/auth/session', sessionFetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  return Boolean(data && data.user);
}
