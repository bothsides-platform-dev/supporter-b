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
      {/* 번호는 제목에 종속되는 2차 요소다 — 모든 뷰포트에서 h3(clamp(20px,2.8vw,30px))보다
          작도록 clamp 를 잡는다(18<20 · 2vw<2.8vw · 24<30, 교차 없음).
          opacity 로 눌러 두지 않는 이유: DESIGN.md §12 가 opacity-38 을 disabled 전용으로
          잡아 두었고, 대비 가드(lib/design/__tests__/text-contrast.test.ts)는 tokens.css 의
          hex 를 읽어 계산하므로 합성색을 보지 못한다. §2 의 처방대로 타입스케일로 낮춘다. */}
      <span className="shrink-0 md-numeric text-[clamp(18px,2vw,24px)] leading-none font-medium text-[var(--md-sys-color-on-surface-variant)] tracking-[-0.01em]">
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
