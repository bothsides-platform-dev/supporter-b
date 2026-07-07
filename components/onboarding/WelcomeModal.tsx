'use client';

// 첫 홈 진입 시 자동으로 뜨는 환영 모달 — /tutorial 진입 CTA와 '나중에 하기'(dismiss)를
// 제공한다. 완주/이탈 시점의 완료 스탬프는 튜토리얼 화면(후속 PR)이 찍는다 — 이 모달은
// dismissed 만 찍는다.
import { useState } from 'react';
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
  const router = useRouter();

  const handleStart = () => {
    router.push('/tutorial');
  };

  const handleDismiss = () => {
    void updateOnboardingAction({ key: ONBOARDING_KEY_FOR_VARIANT[variant], event: 'dismissed' }).catch(
      () => {},
    );
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
