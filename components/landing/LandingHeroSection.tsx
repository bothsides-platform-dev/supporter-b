'use client';

import { useEffect } from 'react';
import { HeroPinnedScene, type HeroContent } from './hero/HeroPinnedScene';

// 히어로 본체는 hero/HeroPinnedScene(다크 오프닝 → 제품 창 부상 → 라이트 리빌)이 소유한다.
// 이 래퍼는 진입점 이름을 유지하면서, 랜딩에 스코프된 부드러운 앵커 스크롤(.landing-scroll)
// 토글만 담당한다. 콘텐츠 슬롯(headline·subCopy·cta·productWindow)은 그대로 씬에 넘긴다 —
// 구매사 랜딩은 무프롭(기본값)으로, PG 랜딩은 자기 카피/목업을 주입해 같은 씬을 재사용한다.
export function LandingHeroSection(props: HeroContent = {}) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('landing-scroll');
    return () => root.classList.remove('landing-scroll');
  }, []);

  return <HeroPinnedScene {...props} />;
}
