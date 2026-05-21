// 가로채기 모달 슬롯 로딩 폴백 — MD3: 스피너 금지, LOADING… 텍스트.
export default function InboxDetailModalLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10">
      <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        LOADING…
      </p>
    </div>
  );
}
