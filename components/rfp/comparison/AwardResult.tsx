'use client';

// 선정 성공 직후에만 표시한다. 재방문 안내는 BuyerDealRoomBody가 소유한다.
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@base-ui/react/dialog';
import { Check, Mail } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { ImprovementSummary, type CurrentConditions } from './ImprovementSummary';
import { useCelebrationConfetti } from '@/lib/hooks/useCelebrationConfetti';
import { josa } from 'es-hangul';
import type { Bid, MerchantTier } from '@/lib/types/bid';

export function AwardResult({
  pgName,
  bid,
  current,
  tier,
  onOpenAgreement,
}: {
  pgName: string;
  bid: Bid;
  current: CurrentConditions;
  tier?: MerchantTier;
  /** 작성 화면만 연다. 서명 요청은 기존 PDF 확인 절차에서 명시적으로 실행한다. */
  onOpenAgreement?: () => void;
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <Dialog.Root open onOpenChange={(_, event) => event.cancel()} disablePointerDismissal>
      <Dialog.Portal>
        <Dialog.Popup
          initialFocus={titleRef}
          className="fixed inset-0 z-50 overflow-y-auto bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] outline-none"
        >
          <AwardCelebration />
          <div className="relative mx-auto flex min-h-full w-full max-w-[528px] flex-col justify-center px-6 py-10">
            <div className="mb-8 flex flex-col items-center text-center">
              <span className="mb-6 inline-flex size-14 items-center justify-center rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]">
                <Check aria-hidden="true" className="size-8" strokeWidth={1.5} />
              </span>
              <Dialog.Title ref={titleRef} tabIndex={-1} render={<h1 />} className="text-[length:var(--md-typescale-headline-large-size)] font-[number:var(--md-typescale-headline-large-weight)] leading-[var(--md-typescale-headline-large-line-height)] tracking-[var(--md-typescale-headline-large-tracking)] outline-none">
                최종 계약 조건 협의를<br />마쳤어요
              </Dialog.Title>
              <Dialog.Description className="mt-3 text-[length:var(--md-typescale-body-large-size)] leading-[var(--md-typescale-body-large-line-height)] text-[var(--md-sys-color-on-surface-variant)] [word-break:keep-all]">
                서포트비와 함께 조율한 조건으로<br />{josa(pgName, '와/과')} 계약을 진행해요.
              </Dialog.Description>
            </div>

            <section aria-label="다음 진행 안내" className="rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-5 [word-break:keep-all]">
              <h2 className="mb-3 flex items-center gap-2 text-[length:var(--md-typescale-body-large-size)] leading-[var(--md-typescale-body-large-line-height)] font-semibold">
                <Mail aria-hidden="true" className="size-5 shrink-0 text-primary" strokeWidth={1.5} />
                <span>영업일 기준 <span className="md-numeric">3</span>일 이내</span>
              </h2>
              <p className="text-[length:var(--md-typescale-body-large-size)] leading-[var(--md-typescale-body-large-line-height)]">{pgName} 온보딩 담당자가 이메일을 보내드려요.</p>
              <p className="mt-2 text-[length:var(--md-typescale-body-large-size)] leading-[var(--md-typescale-body-large-line-height)] text-[var(--md-sys-color-on-surface-variant)]">받은 메일의 안내에 따라 최종 계약을 마무리해 주세요.</p>
            </section>

            <Accordion className="mt-6 [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-primary [&_button:focus-visible]:ring-offset-2">
              <AccordionItem value="selected-conditions" title={<span className="text-[length:var(--md-typescale-body-medium-size)] leading-[var(--md-typescale-body-medium-line-height)]">선정한 조건 보기</span>}>
                <ImprovementSummary bid={bid} current={current} tier={tier} showCurrentHint={false} />
              </AccordionItem>
            </Accordion>

            {onOpenAgreement && <section aria-label="합의서 작성 안내" className="mt-6 space-y-3 border-t border-[var(--md-sys-color-outline-variant)] pt-5">
              <h2 className="text-[17px] font-semibold">다음은 노온 합의서 작성이에요</h2>
              <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">회사 정보를 확인하고 합의서를 작성해요. 서명 요청은 PDF를 확인한 뒤 직접 진행해요.</p>
              <Button className="min-h-11 w-full sm:min-h-9" size="lg" onClick={onOpenAgreement}>합의서 작성하기</Button>
            </section>}
            <Button className={`${onOpenAgreement ? 'mt-4 min-h-11 sm:min-h-9' : 'mt-6'} w-full`} variant={onOpenAgreement ? 'text' : 'filled'} size="lg" onClick={() => router.push('/rfp')}>
              견적 목록으로 돌아가요
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Portal이 실제로 열린 뒤에 훅을 마운트해야 canvas ref가 준비된다.
function AwardCelebration() {
  const { canvasRef } = useCelebrationConfetti();
  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 h-full w-full" />;
}
