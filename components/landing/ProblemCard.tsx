type ProblemCardProps = {
  num: string;
  title: string;
  desc: string;
};

// 세로형 문제 카드 — 번호(좌) + 제목·설명(우)을 한 행으로 묶어 세로로 나열한다.
export function ProblemCard({ num, title, desc }: ProblemCardProps) {
  return (
    <div className="flex gap-[var(--s-5)] md:gap-[var(--s-7)] border border-[var(--md-sys-color-outline-variant)] rounded-md p-[var(--s-6)]">
      <span className="shrink-0 tabular-nums text-[var(--text-xl)] leading-none font-medium text-[var(--md-sys-color-outline)] tracking-[-0.01em]">
        {num}
      </span>
      <div className="flex flex-col gap-[var(--s-2)]">
        <h3 className="text-[var(--text-lg)] font-medium tracking-[-0.012em] text-[var(--md-sys-color-on-surface)]">
          {title}
        </h3>
        <p className="text-[var(--text-md)] leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)]">
          {desc}
        </p>
      </div>
    </div>
  );
}
