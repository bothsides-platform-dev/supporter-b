import { type ReactNode } from 'react';
import { FadeInView } from '@/components/landing/FadeInView';
import { LANDING_TYPE } from '@/components/landing/landing-type';

type Item = { title: string; desc: string };

// 신규 성장 고객사 유형 — 정적 2x2 그리드로 배치해 FHD 한 화면에 4장이 모두 들어오게 한다.
// 진입 시 순서대로 스태거 페이드인(FadeInView, whileInView once). 이전엔 스크롤 핀 누적
// 리스트였으나 4번째 카드가 화면 밖에서 등장하는 문제로 정적 2x2 로 교체했다.
// 카드는 'NN / 총개수' 카운터를 유지해 순번 있는 유형 목록임을 드러낸다.
function CustomerTypeCard({
  index,
  count,
  title,
  desc,
}: {
  index: number;
  count: number;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex h-full flex-col gap-[var(--s-3)] rounded-md border border-[var(--md-sys-color-outline-variant)] p-[var(--s-7)] md:p-[var(--s-8)]">
      <span className="font-mono tabular-nums text-sm leading-[inherit] tracking-[-0.02em] text-[var(--md-sys-color-primary)]">
        {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
      </span>
      <h3 className={`${LANDING_TYPE.heading3} text-[var(--md-sys-color-on-surface)]`}>{title}</h3>
      <p className="text-sm leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)]">
        {desc}
      </p>
    </div>
  );
}

export function CustomerTypesGrid({
  heading,
  intro,
  items,
  stagger = 0.08,
}: {
  heading: ReactNode;
  intro?: ReactNode;
  items: Item[];
  stagger?: number;
}) {
  const count = items.length;
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-[var(--s-9)]">
      <div className="flex flex-col gap-[var(--s-5)]">
        {heading}
        {intro}
      </div>
      <div className="grid grid-cols-1 gap-[var(--s-4)] md:grid-cols-2">
        {items.map((item, i) => (
          <FadeInView key={item.title} delay={i * stagger} className="h-full">
            <CustomerTypeCard index={i} count={count} title={item.title} desc={item.desc} />
          </FadeInView>
        ))}
      </div>
    </div>
  );
}
