'use client';

// 첫 홈 진입 시 자동으로 뜨는 환영 모달 — /tutorial 진입 CTA와 '나중에 하기'(dismiss)를
// 제공한다. 완주/이탈 시점의 완료 스탬프는 BuyerTutorialFlow/PgTutorialFlow/
// TutorialLeaveGuard가 찍는다 — 이 모달은 dismissed 만 찍는다.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/primitives/Button';
import { updateOnboardingAction } from '@/lib/server/actions/onboarding/updateOnboardingAction';
import type { OnboardingKey } from '@/lib/types/onboarding';

type Variant = 'buyer' | 'pg';

const ONBOARDING_KEY_FOR_VARIANT: Record<Variant, OnboardingKey> = {
  buyer: 'buyerTutorial',
  pg: 'pgTutorial',
};

const SUBTITLE: Record<Variant, string> = {
  buyer: '여러 PG사의 견적을 한 번에 비교하고 선정하는 흐름을 둘러볼 수 있어요.',
  pg: '견적 요청을 받아 견적을 제출하는 흐름을 둘러볼 수 있어요.',
};

export function WelcomeModal({ variant }: { variant: Variant }) {
  const [open, setOpen] = useState(true);
  const stampedRef = useRef(false);
  const router = useRouter();

  const stampDismissed = () => {
    if (stampedRef.current) return;
    stampedRef.current = true;
    void updateOnboardingAction({ key: ONBOARDING_KEY_FOR_VARIANT[variant], event: 'dismissed' }).catch(
      () => {},
    );
  };

  const handleStart = () => {
    router.push('/tutorial');
  };

  const handleDismiss = () => {
    stampDismissed();
    setOpen(false);
  };

  // Esc·바깥 클릭 등 어떤 경로로 닫혀도 dismissed를 찍는다 — 스탬프 없이 닫히면
  // shouldShowWelcome이 계속 true라 홈 방문마다 모달이 무한 재등장한다.
  const handleOpenChange = (next: boolean) => {
    if (!next) stampDismissed();
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>서포트 B에 오신 걸 환영해요</DialogTitle>
          <DialogDescription>{SUBTITLE[variant]}</DialogDescription>
        </DialogHeader>

        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          직접 체험해보는 데 약 3분이면 충분해요.
        </p>

        <DialogFooter>
          <Button variant="outlined" size="sm" onClick={handleDismiss}>
            나중에 하기
          </Button>
          <Button size="sm" onClick={handleStart}>
            체험 시작하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
