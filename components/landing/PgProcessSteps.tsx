export type ProcessStep = {
  n: string;
  title: string;
  body: string;
  note: string;
};

// 참여 프로세스 5단계 — 번호 + 제목 + 본문 + 보조문구를 세로로 나열한다.
export function PgProcessSteps({ steps }: { steps: readonly ProcessStep[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s) => (
        <li
          key={s.n}
          className="flex gap-[var(--s-5)] md:gap-[var(--s-7)] border-t border-[var(--md-sys-color-outline-variant)] py-[var(--s-7)] first:border-t-0 first:pt-0"
        >
          <span className="shrink-0 font-mono tabular-nums text-[var(--text-xl)] leading-none tracking-[-0.02em] text-[var(--md-sys-color-primary)]">
            {s.n}
          </span>
          <div className="flex flex-col gap-[var(--s-2)]">
            <h3 className="text-[var(--text-lg)] font-medium tracking-[-0.012em] text-[var(--md-sys-color-on-surface)]">
              {s.title}
            </h3>
            <p className="text-[var(--text-md)] leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)]">
              {s.body}
            </p>
            <p className="text-[13px] leading-[1.6] tracking-[-0.004em] text-[var(--md-sys-color-outline)]">
              {s.note}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
