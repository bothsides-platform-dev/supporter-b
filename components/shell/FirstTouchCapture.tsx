'use client';

import { useEffect } from 'react';
import { captureFirstTouch } from '@/lib/attribution/first-touch';
import { funnelAnalytics } from '@/lib/analytics/funnel';

/**
 * 사이트 어느 페이지든 최초 진입 시 UTM/referrer 유입 정보를 1회 캡처(write-once,
 * lib/attribution/first-touch.ts)한다. 렌더링 없음 — 루트 레이아웃에 마운트해
 * 전 페이지가 진입점이 되게 한다. 가입 완료 시 lib/auth/finalizeSignup.ts 가
 * readFirstTouch() 로 읽어 서버에 전달한다.
 */
export function FirstTouchCapture() {
  useEffect(() => {
    // Docs assists are last-touch with their own 30-day clock, even for returning visitors.
    // Consume before first touch so transport metadata never enters signupSource.
    const clean = funnelAnalytics.docsArrival(window.location.href);
    if (clean !== window.location.href) {
      try { window.history.replaceState(window.history.state, '', clean); } catch { /* Navigation must keep working. */ }
    }
    captureFirstTouch(clean);
  }, []);
  return null;
}
