// 제목 + 설명 카드(번호 eyebrow). 화면4(검증/공정 3개)·화면6(핵심 이점 6개) 공용.
// ProblemCard 와 동일한 타이포 스케일을 사용해 시각 일관성을 맞춘다.
export function PgFeatureCard({
  index,
  title,
  desc,
}: {
  index: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex h-full flex-col gap-[var(--s-3)] border border-[var(--md-sys-color-outline-variant)] rounded-md p-[var(--s-6)]">
      <span className="font-mono tabular-nums text-[13px] tracking-[-0.02em] text-[var(--md-sys-color-primary)]">
        {index}
      </span>
      <h3 className="text-[var(--text-lg)] font-medium tracking-[-0.012em] text-[var(--md-sys-color-on-surface)]">
        {title}
      </h3>
      <p className="text-[var(--text-md)] leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)]">
        {desc}
      </p>
    </div>
  );
}
