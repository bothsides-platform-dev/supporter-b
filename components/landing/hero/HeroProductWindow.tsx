import { OfferComparisonTable } from '@/components/landing/OfferComparisonTable';
import { Chip } from '@/components/primitives/Chip';

// 히어로 '제품 창' — 다크 오프닝 씬에서 스크롤과 함께 떠오르는 라이트 앱 창 목업.
// 실데모(DemoAppShell) 임베드 금지: 데모 fixtures가 모듈 스코프 Date.now()를 쓰는
// hydration mismatch 지뢰(기지 버그)가 있다. 이 창의 내용물은 전부 결정적 리터럴이어야 한다.
// 장식용 비주얼이므로 인터랙션·접근성 트리에서 제외한다(pointer-events-none + aria-hidden).
// 단, 비교표는 모바일 폭에서 7열이 다 안 들어가므로 예외적으로 가로 스크롤만 허용한다
// (표 wrapper에 pointer-events-auto, OfferComparisonTable은 기본 showScrollFade=true 사용).
export function HeroProductWindow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none flex h-full w-full select-none flex-col overflow-hidden rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-4)]"
    >
      {/* 창 크롬 — 데모 창(demo-app-window)과 같은 계열의 미니 탑바 */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
        </span>
        <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--md-sys-color-on-surface-variant)]">
          견적 비교 <span className="md-numeric">P-2042-0042</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-[var(--s-4)] overflow-hidden p-5 md:p-6">
        <div className="flex items-center gap-[var(--s-3)]">
          <span className="text-[15px] font-medium tracking-[-0.01em] text-[var(--md-sys-color-on-surface)]">
            받은 견적
          </span>
          <Chip label="입찰 3건 도착" color="primary" />
        </div>
        {/* 표만 예외적으로 인터랙션 허용 — 모바일 폭에서 가로 드래그로 나머지 열을 볼 수 있다 */}
        <div className="pointer-events-auto">
          <OfferComparisonTable />
        </div>
      </div>
    </div>
  );
}
