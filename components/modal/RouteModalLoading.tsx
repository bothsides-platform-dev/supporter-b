// 가로채기 모달 슬롯 공통 로딩 폴백 — 슬롯 내부(전체 페이지 위)에 렌더된다.
// MD3: 스피너 금지, LOADING… 텍스트. 각 @modal/.../loading.tsx 가 이걸 default 로
// 재노출한다(중복 제거).
export default function RouteModalLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10">
      <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        LOADING…
      </p>
    </div>
  );
}
