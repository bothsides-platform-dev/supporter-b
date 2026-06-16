'use client';

import { useEffect, useState } from 'react';

function readDraft(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

// 키별 문자열 초안을 localStorage 에 동기 보존한다. 디바운스 없이 즉시 기록 — 짧은
// 텍스트라 비용이 작고, 디바운스 타이밍에 의존하는 테스트 플레이크도 피한다. 빈
// 문자열이면 키를 제거한다. SSR/localStorage 접근 불가(프라이빗 모드 등) 시 무해.
//
// 초기값은 마운트 시 1회 읽는다 — 호출처가 key 변경 시 remount 하는 모델을 가정한다
// (예: ThreadView 는 conversationId 별 Suspense key 로 remount).
export function useStringDraft(key: string): [string, (value: string) => void] {
  const [draft, setDraft] = useState<string>(() => readDraft(key));

  useEffect(() => {
    try {
      if (draft) window.localStorage.setItem(key, draft);
      else window.localStorage.removeItem(key);
    } catch {
      // localStorage 접근 불가 — 보존 없이 동작.
    }
  }, [draft, key]);

  return [draft, setDraft];
}
