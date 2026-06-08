type MetricCardProps = {
  value: string;
  caption: string;
  suffix?: string;
};

// 데이터 수치 카드 — 큰 숫자 + 짧은 캡션. 과한 장식 없이 신뢰감 있는 B2B 톤.
export function MetricCard({ value, caption, suffix }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-[var(--s-3)]">
      <span className="flex items-baseline gap-2">
        <span className="md-numeric text-[clamp(34px,5vw,56px)] leading-none tracking-[-0.03em] text-[var(--md-sys-color-on-surface)]">
          {value}
        </span>
        {suffix && (
          <span className="text-[var(--text-md)] font-medium text-[var(--md-sys-color-on-surface-variant)]">
            {suffix}
          </span>
        )}
      </span>
      <span className="text-[var(--text-sm)] leading-[1.5] text-[var(--md-sys-color-on-surface-variant)]">
        {caption}
      </span>
    </div>
  );
}
