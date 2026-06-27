/**
 * 미선정 PG 에게 보여주는 안내(연락처 없음). 연락처 교환은 선정 PG↔구매사만.
 */
export function NotSelectedNotice() {
  return (
    <section className="rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-4">
      <h3 className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
        이번엔 선정되지 않았어요
      </h3>
      <p className="mt-1 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        구매사가 다른 PG를 선정했어요. 좋은 기회로 다시 만나요.
      </p>
    </section>
  );
}
