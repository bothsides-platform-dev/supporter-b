'use client';

import type { ReactNode } from 'react';
import styles from './LandingHeader.module.css';
import { Logo } from '@/components/primitives/Logo';
import { useHeroToneStore } from './hero/hero-tone-store';
import { LandingInsightLink } from './LandingInsightLink';

// 공개 랜딩 고정 헤더 — 히어로 다크 씬에서는 솔리드 다크 배경과 라이트 톤,
// 라이트 리빌을 지나면 surface+border로 전환한다. 톤 상태는 hero-tone-store 구독.
// Logo는 내부에서 --md-sys-color-on-surface var로 그리므로, over-dark 동안 그 var만
// inverse 값으로 뒤집는 래퍼를 씌운다(드롭다운·모바일 패널은 이 래퍼 밖이라 영향 없음).
// 외부 인사이트 링크는 섹션 메뉴와 떨어뜨려 로고 옆에 헤더가 직접 둔다(구매사·PG 공통, PC 전용).
export function LandingHeader({ children }: { children?: ReactNode }) {
  const overDark = useHeroToneStore((s) => s.overDark);

  return (
    <header
      data-over-dark={overDark || undefined}
      className={`group/lheader ${styles.header}`}
    >
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className="group-data-[over-dark]/lheader:[--md-sys-color-on-surface:var(--md-sys-color-inverse-on-surface)]">
            <Logo animated />
          </span>
          <span aria-hidden="true" className={styles.brandDivider} />
          <LandingInsightLink className={`${styles.barLink} ${styles.brandInsight}`} />
        </div>
        <div className={styles.navigation}>{children}</div>
      </div>
    </header>
  );
}
