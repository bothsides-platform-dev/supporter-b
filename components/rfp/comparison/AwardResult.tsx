'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@base-ui/react/dialog';
import { Check, ChevronDown, Mail } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { ImprovementSummary, type CurrentConditions } from './ImprovementSummary';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';
import { josa } from 'es-hangul';
import type { Bid, MerchantTier } from '@/lib/types/bid';

type Props = {
  pgName: string;
  bid: Bid;
  current: CurrentConditions;
  tier?: MerchantTier;
};

// 실제 선정 성공 때만 마운트한다. 포털의 modal 경계가 배경 조작과 포커스 이탈을 막는다.
export function AwardResult(props: Props) {
  return (
    <Dialog.Root open disablePointerDismissal>
      <Dialog.Portal>
        <AwardResultContent {...props} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AwardResultContent({ pgName, bid, current, tier }: Props) {
  const router = useRouter();
  const { canvasRef } = useCelebrationConfetti();
  const [expanded, setExpanded] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  return (
    <Dialog.Popup initialFocus={headingRef} className="fixed inset-0 z-[100] overflow-y-auto bg-[var(--md-sys-color-surface)] outline-none">
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 h-full w-full" />
      <div className="relative flex min-h-full px-6 py-10 sm:py-12">
        <div className="m-auto flex w-full max-w-[480px] flex-col items-center gap-6 sm:gap-7">
          <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]">
            <Check className="size-8" aria-hidden />
          </span>
          <div className="text-center">
            <Dialog.Title ref={headingRef} tabIndex={-1} className="text-[length:var(--md-typescale-headline-medium-size)] font-semibold leading-[1.3] tracking-[-0.02em] outline-none">
              최종 계약 조건 협의를 마쳤어요
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-[length:var(--md-typescale-body-large-size)] leading-[1.5] text-[var(--md-sys-color-on-surface-variant)]">
              서포트비와 함께 조율한 조건으로<br />{josa(pgName, '와/과')} 계약을 진행해요.
            </Dialog.Description>
          </div>
          <section aria-label="이메일 안내" className="flex w-full gap-3 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-4 sm:gap-3.5 sm:p-5">
            <Mail aria-hidden className="mt-0.5 size-[22px] shrink-0 text-[var(--md-sys-color-primary)]" />
            <div className="min-w-0 text-[length:var(--md-typescale-body-large-size)] leading-[1.5]">
              <h2 className="text-[length:var(--md-typescale-title-medium-size)] font-semibold">영업일 기준 <span className="md-numeric">3</span>일 이내</h2>
              <p className="mt-2">{pgName} 온보딩 담당자가 이메일을 보내드려요.</p>
              <p className="mt-2 text-[var(--md-sys-color-on-surface-variant)]">받은 메일의 안내에 따라 최종 계약을 마무리해 주세요.</p>
            </div>
          </section>
          <div className="w-full border-y border-[var(--md-sys-color-outline-variant)]">
            <button type="button" aria-expanded={expanded} aria-controls="awarded-conditions" onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between py-4 text-left md-label-large focus-visible:outline-2 focus-visible:outline-[var(--md-sys-color-primary)]">
              선정한 조건 보기<ChevronDown aria-hidden className={`size-4 ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && <div id="awarded-conditions" className="pb-5 pt-2"><ImprovementSummary bid={bid} current={current} tier={tier} showCurrentInputHint={false} /></div>}
          </div>
          <Button fullWidth size="lg" onClick={() => router.push('/rfp')}>견적 목록으로 돌아가요</Button>
        </div>
      </div>
    </Dialog.Popup>
  );
}
