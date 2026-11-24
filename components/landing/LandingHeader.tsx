'use client';

import type { ReactNode } from 'react';
import styles from './LandingHeader.module.css';
import { Logo } from '@/components/primitives/Logo';
import { LandingInsightLink } from './LandingInsightLink';

// 공개 랜딩 고정 헤더 — 히어로와 본문이 같은 surface 라 처음부터 끝까지 surface+border 한 톤이다
// (스크롤에 따른 헤더 톤 전환은 2026-11-23 A안에서 제거했다).
// 외부 인사이트 링크는 섹션 메뉴와 떨어뜨려 로고 옆에 헤더가 직접 둔다(구매사·PG 공통, PC 전용).
export function LandingHeader({ children }: { children?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Logo animated />
          <span aria-hidden="true" className={styles.brandDivider} />
          <LandingInsightLink className={`${styles.barLink} ${styles.brandInsight}`} />
        </div>
        <div className={styles.navigation}>{children}</div>
      </div>
    </header>
  );
}
