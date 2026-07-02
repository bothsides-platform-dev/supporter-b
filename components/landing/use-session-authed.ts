'use client';

import { useEffect, useState } from 'react';

// static(force-static) 랜딩 헤더가 로그인 상태를 반영하기 위한 클라이언트 세션 조회.
// 랜딩 페이지는 빌드 타임에 프리렌더되므로 서버 auth()는 항상 "비로그인"으로 고정된다.
// 대신 next-auth 기본 엔드포인트(JWT 전략이라 쿠키만으로 응답)를 마운트 후 fetch해
// 실제 로그인 상태로 헤더를 갱신한다. proxy.ts가 /api/* 를 항상 통과시키므로
// 비인증 방문자도 이 엔드포인트에 접근 가능하다.
export function useSessionAuthed(): boolean {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setAuthed(Boolean(data && data.user));
      })
      .catch(() => {
        // 네트워크 실패 시 비로그인(static 기본값) 유지 — fail-closed.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return authed;
}
