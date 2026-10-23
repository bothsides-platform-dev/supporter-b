'use client';

import { useId, useRef } from 'react';
import { OfferComparisonTable } from '@/components/landing/OfferComparisonTable';
import { STEP_COLUMNS } from '@/components/landing/offer-comparison-data';

export type SolutionPoint = { title: string; description: string };

export function SolutionShowcase({
  points,
  activeStep = 0,
  onSelect,
}: {
  points: SolutionPoint[];
  activeStep?: number;
  onSelect?: (step: number) => void;
}) {
  const id = useId();
  const tableRef = useRef<HTMLDivElement>(null);
  function select(step: number) {
    onSelect?.(step);
    const scroll = tableRef.current?.querySelector<HTMLTableElement>('table')?.parentElement;
    const headers = scroll?.querySelectorAll('th');
    const column = STEP_COLUMNS[step]?.[0] ?? 0;
    if (scroll && headers?.[column]) {
      const left = column === 0 ? 0 : headers[column].offsetLeft - headers[0].offsetWidth;
      scroll.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }
  }
  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[260px_minmax(0,1fr)]">
      <div className="grid grid-cols-2 items-start gap-3 xl:flex xl:min-h-[400px] xl:flex-col">
        {points.map((point, i) => {
          const active = activeStep === i;
          return (
            <div key={point.title} className="contents xl:block xl:w-full xl:min-w-0 xl:rounded-md xl:border-l-2 xl:p-3 xl:transition-colors xl:duration-150"
              style={{ borderColor: active ? 'var(--md-sys-color-primary)' : 'transparent', background: active ? 'color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent)' : undefined }}>
              <button type="button" aria-pressed={active} aria-controls={id + i}
                onClick={() => select(i)}
                className="min-h-12 w-full rounded-md border-l-2 px-3 text-left text-base leading-6 aria-pressed:border-[var(--md-sys-color-primary)] aria-pressed:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_6%,transparent)] border-transparent xl:min-h-8 xl:border-0 xl:px-0 xl:aria-pressed:bg-transparent focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)]"
                style={{ fontWeight: active ? 600 : 500 }}>
                {point.title}
              </button>
              <p id={id + i} aria-hidden={!active}
                className={`[grid-area:3/1/4/3] xl:[grid-area:auto] mt-2 text-base leading-6 text-[var(--md-sys-color-on-surface-variant)] transition-opacity duration-150 ${active ? '' : 'xl:hidden'}`}
                style={{ visibility: active ? 'visible' : 'hidden', opacity: active ? 1 : 0 }}>
                {point.description}
              </p>
            </div>
          );
        })}
      </div>
      <div ref={tableRef} className="min-w-0">
        <h3 className="mb-3 text-[13px] font-medium text-[var(--md-sys-color-on-surface-variant)]">견적 비교 예시</h3>
        <OfferComparisonTable activeStep={activeStep} presentation="solution" />
      </div>
    </div>
  );
}
