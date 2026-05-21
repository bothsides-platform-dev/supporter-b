// 가로채기 모달 슬롯의 로딩 폴백 — 슬롯 내부(전체 페이지 위)에 렌더된다.
// MD3: 스피너 금지, LOADING… 텍스트. 전체페이지 스켈레톤 재사용 금지.
export default function RfpDetailModalLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10">
      <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        LOADING…
      </p>
    </div>
  );
}
