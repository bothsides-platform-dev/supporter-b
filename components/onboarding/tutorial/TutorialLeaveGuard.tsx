'use client';

// 튜토리얼 화면에서 /tutorial 밖 내부 링크 클릭을 가로채 확인을 받는 이탈 가드.
// [계속 체험하기]=잔류, [나중에 하기]=dismissed 스탬프 후 이동, [건너뛰기]=completed
// 스탬프 후 이동(코치마크 건너뛰기 버튼과 스탬프 의미 동일 — done 화면만 생략).
// router.push 프로그래매틱 이동·브라우저 뒤로가기는 잡지 않는다(수용한 한계 —
// 무스탬프 이탈은 다음 홈 방문 시 환영 모달 재노출로 흡수). Next Link는
// defaultPrevented를 존중하므로 capture preventDefault로 내비게이션이 멈춘다.
import { useEffect, useState } from 'react';
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

const KEY_FOR_VARIANT: Record<'buyer' | 'pg', OnboardingKey> = {
  buyer: 'buyerTutorial',
  pg: 'pgTutorial',
};

export function TutorialLeaveGuard({ variant }: { variant: 'buyer' | 'pg' }) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const el = event.target instanceof Element ? event.target : null;
      const anchor = el?.closest('a[href]');
      if (!anchor) return;
      if (anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href.startsWith('/')) return;
      if (href === '/tutorial' || href.startsWith('/tutorial/') || href.startsWith('/tutorial?'))
        return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, []);

  const leave = (eventType: 'dismissed' | 'completed') => {
    const href = pendingHref;
    if (!href) return;
    void updateOnboardingAction({ key: KEY_FOR_VARIANT[variant], event: eventType }).catch(
      () => {},
    );
    setPendingHref(null);
    router.push(href);
  };

  return (
    <Dialog open={pendingHref !== null} onOpenChange={(next) => { if (!next) setPendingHref(null); }}>
      <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>튜토리얼을 나갈까요?</DialogTitle>
          <DialogDescription>지금 나가도 홈에서 언제든 다시 시작할 수 있어요.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="text" size="sm" onClick={() => leave('completed')}>
            건너뛰기
          </Button>
          <Button variant="outlined" size="sm" onClick={() => leave('dismissed')}>
            나중에 하기
          </Button>
          <Button size="sm" onClick={() => setPendingHref(null)}>
            계속 체험하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
