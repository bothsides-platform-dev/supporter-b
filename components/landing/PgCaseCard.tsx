export type PgCaseCardProps = {
  // 큰 숫자 지표(예: '300%'). 카드 간 시각 일관성을 위해 모든 사례가 지표를 가진다.
  metric: string;
  metricCaption: string;
  quote: string;
  role: string;
};

// 파트너사 영업 성과 사례 카드 — 큰 지표 + 성과 캡션 + 인용 + 역할.
// 리니어 톤에 맞춰 사진 배경 없이 1px 보더 카드 + 옅은 따옴표 글리프 악센트만 둔다.
export function PgCaseCard({ metric, metricCaption, quote, role }: PgCaseCardProps) {
  return (
    <figure className="relative overflow-hidden flex h-full flex-col gap-[var(--s-5)] rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-[var(--s-7)]">
      {/* 옅은 장식 따옴표 — 사진 배경 대체 악센트 */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-6 right-2 select-none font-serif text-[140px] leading-none text-[var(--md-sys-color-outline-variant)] opacity-50"
      >
        &rdquo;
      </span>

      <div className="relative flex flex-col gap-[var(--s-1)]">
        <span
          data-testid="case-metric"
          className="md-numeric text-[clamp(32px,4vw,48px)] font-semibold leading-none tracking-[-0.02em] text-[var(--md-sys-color-primary)]"
        >
          {metric}
        </span>
        <span className="text-[var(--text-md)] font-medium tracking-[-0.008em] text-[var(--md-sys-color-on-surface)]">
          {metricCaption}
        </span>
      </div>

      <blockquote className="relative text-[clamp(15px,1.6vw,17px)] leading-[1.7] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)]">
        &ldquo;{quote}&rdquo;
      </blockquote>

      <figcaption className="relative mt-auto font-mono text-[var(--text-2xs)] tracking-[0.06em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        {role}
      </figcaption>
    </figure>
  );
}
