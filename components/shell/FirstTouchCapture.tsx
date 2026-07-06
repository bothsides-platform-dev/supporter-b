'use client';

import { useEffect } from 'react';
import { captureFirstTouch } from '@/lib/attribution/first-touch';

/**
 * 사이트 어느 페이지든 최초 진입 시 UTM/referrer 유입 정보를 1회 캡처(write-once,
 * lib/attribution/first-touch.ts)한다. 렌더링 없음 — 루트 레이아웃에 마운트해
 * 전 페이지가 진입점이 되게 한다. 가입 완료 시 lib/auth/finalizeSignup.ts 가
 * readFirstTouch() 로 읽어 서버에 전달한다.
 */
export function FirstTouchCapture() {
  useEffect(() => {
    captureFirstTouch();
  }, []);
  return null;
}
