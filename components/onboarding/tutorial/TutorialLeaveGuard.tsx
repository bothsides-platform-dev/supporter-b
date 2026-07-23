'use client';

// 튜토리얼 화면에서 /tutorial 밖 내부 링크 클릭을 가로채 확인을 받는 이탈 가드.
// [계속 체험하기]=잔류, [나중에 하기]=dismissed 스탬프 후 이동, [건너뛰기]=completed
// 스탬프 후 이동(코치마크 건너뛰기 버튼과 스탬프 의미 동일 — done 화면만 생략).
// router.push 프로그래매틱 이동·브라우저 뒤로가기는 잡지 않는다(수용한 한계 —
// 무스탬프 이탈은 다음 홈 방문 시 환영 모달 재노출로 흡수). Next Link는
// defaultPrevented를 존중하므로 capture preventDefault로 내비게이션이 멈춘다.
import { useEffect, useRef, useState } from 'react';
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
import { stampOnboarding, stampSettled } from '@/components/onboarding/stamp-onboarding';
import type { OnboardingKey } from '@/lib/types/onboarding';

const KEY_FOR_VARIANT: Record<'buyer' | 'pg', OnboardingKey> = {
  buyer: 'buyerTutorial',
  pg: 'pgTutorial',
};

export function TutorialLeaveGuard({ variant }: { variant: 'buyer' | 'pg' }) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // in-flight 가드 — 스탬프 대기 중 재클릭(다른 버튼 포함)이 상충 이벤트
  // (completed vs dismissed)를 이중 발사하지 않게. WelcomeModal stampedRef 패턴.
  const leavingRef = useRef(false);

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
      // '/'로 시작하는 경로만 내부로 본다 — protocol-relative(//host)와 백슬래시
      // 변형(/\host)은 외부 오리진이라 가드 미개입(브라우저 기본 동작에 맡김).
      if (!/^\/(?![/\\])/.test(href)) return;
      if (href === '/tutorial' || href.startsWith('/tutorial/') || href.startsWith('/tutorial?'))
        return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, []);

  // stamp-then-move — 스탬프 쓰기가 settle 된 뒤에만 이동한다(같은 틱 push 는
  // /home RSC 읽기가 쓰기를 앞질러 환영 모달을 재노출시킬 수 있다). 대기는
  // stampSettled 상한으로 저속 네트워크 프리즈를 막고, 실패해도 이동은 진행 —
  // stampOnboarding 이 토스트로 알리고 절대 reject 하지 않는다.
  const leave = async (eventType: 'dismissed' | 'completed') => {
    const href = pendingHref;
    if (!href || leavingRef.current) return;
    leavingRef.current = true;
    await stampSettled(stampOnboarding({ key: KEY_FOR_VARIANT[variant], event: eventType }));
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
          <Button variant="text" size="sm" onClick={() => void leave('completed')}>
            건너뛰기
          </Button>
          <Button variant="outlined" size="sm" onClick={() => void leave('dismissed')}>
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
