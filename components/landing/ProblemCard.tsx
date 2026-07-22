import { LANDING_TYPE } from '@/components/landing/landing-type';

type ProblemCardProps = {
  num: string;
  title: string;
  desc: string;
};

// 세로형 문제 카드 — 번호(좌) + 제목·설명(우)을 한 행으로 묶어 세로로 나열한다.
export function ProblemCard({ num, title, desc }: ProblemCardProps) {
  return (
    <div className="flex gap-[var(--s-5)] md:gap-[var(--s-7)] border border-[var(--md-sys-color-outline-variant)] rounded-md p-[var(--s-6)]">
      <span className="shrink-0 md-numeric text-[clamp(28px,4vw,44px)] leading-none font-medium text-[var(--md-sys-color-on-surface-variant)] tracking-[-0.01em]">
        {num}
      </span>
      <div className="flex flex-col gap-[var(--s-3)]">
        <h3 className={`${LANDING_TYPE.heading3} text-[var(--md-sys-color-on-surface)]`}>
          {title}
        </h3>
        <p className={`${LANDING_TYPE.lead} text-[var(--md-sys-color-on-surface-variant)]`}>
          {desc}
        </p>
      </div>
    </div>
  );
}
