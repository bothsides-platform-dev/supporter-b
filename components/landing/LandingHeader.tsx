'use client';

import type { ReactNode } from 'react';
import { Logo } from '@/components/primitives/Logo';
import { useHeroToneStore } from './hero/hero-tone-store';

// 구매사 랜딩 고정 헤더 — 히어로 다크 오프닝 씬 위(over-dark)에서는 투명 배경에 라이트 톤,
// 라이트 리빌을 지나면 surface+border로 전환한다. 톤 상태는 hero-tone-store 구독.
// Logo는 내부에서 --md-sys-color-on-surface var로 그리므로, over-dark 동안 그 var만
// inverse 값으로 뒤집는 래퍼를 씌운다(드롭다운·모바일 패널은 이 래퍼 밖이라 영향 없음).
export function LandingHeader({ children }: { children?: ReactNode }) {
  const overDark = useHeroToneStore((s) => s.overDark);

  return (
    <header
      data-over-dark={overDark || undefined}
      className="group/lheader fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-8 h-[var(--shell-topbar)] border-b transition-colors duration-300 bg-[var(--md-sys-color-surface)] border-[var(--md-sys-color-outline-variant)] data-[over-dark]:bg-transparent data-[over-dark]:border-transparent"
    >
      <span className="group-data-[over-dark]/lheader:[--md-sys-color-on-surface:var(--md-sys-color-inverse-on-surface)]">
        <Logo />
      </span>
      <div className="flex items-center gap-[var(--s-3)]">{children}</div>
    </header>
  );
}
