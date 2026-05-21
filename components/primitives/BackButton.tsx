'use client';

// 풀페이지 상세에서 직전 위치로 복귀하는 affordance. 칸반·목록·검색 어디서 왔든
// router.back() 으로 그 자리(스크롤 포함)로 돌아간다 — 제거된 상세 모달의 닫기
// 동작을 모든 진입점에서 동일하게 재현. 단 직접 URL 진입처럼 앱 내 히스토리가
// 없으면 fallback 으로 push 해 앱 밖으로 튕기지 않게 한다.
import { useRouter } from 'next/navigation';

export function BackButton({
  fallbackHref = '/home',
  label = '← 뒤로',
}: {
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
      className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
    >
      {label}
    </button>
  );
}
