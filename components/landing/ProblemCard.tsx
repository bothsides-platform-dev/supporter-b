import { LANDING_TYPE } from '@/components/landing/landing-type';

type ProblemCardProps = {
  num: string;
  title: string;
  desc: string;
};

// 번호와 제목의 첫 줄 기준선을 맞추고, 설명은 제목 열에 배치한다.
export function ProblemCard({ num, title, desc }: ProblemCardProps) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-[var(--s-5)] gap-y-[var(--s-3)] md:gap-x-[var(--s-7)] border border-[var(--md-sys-color-outline-variant)] rounded-md p-[var(--s-6)]">
      {/* 제목과 같은 크기·줄 높이로 맞추고 두 자리 너비를 확보해 각 카드의 제목 열을 고정한다. */}
      <span className={`md-numeric w-[2ch] ${LANDING_TYPE.heading3} text-[var(--md-sys-color-on-surface-variant)]`}>
        {num}
      </span>
      <h3 className={`${LANDING_TYPE.heading3} text-[var(--md-sys-color-on-surface)]`}>
        {title}
      </h3>
      <p className={`col-start-2 ${LANDING_TYPE.lead} text-[var(--md-sys-color-on-surface-variant)]`}>
        {desc}
      </p>
    </div>
  );
}
