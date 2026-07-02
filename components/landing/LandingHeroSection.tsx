'use client';

import { useEffect } from 'react';
import { HeroPinnedScene } from './hero/HeroPinnedScene';

// 히어로 본체는 hero/HeroPinnedScene(다크 오프닝 → 제품 창 부상 → 라이트 리빌)이 소유한다.
// 이 래퍼는 진입점 이름을 유지하면서, 랜딩에 스코프된 부드러운 앵커 스크롤(.landing-scroll)
// 토글만 담당한다.
export function LandingHeroSection() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('landing-scroll');
    return () => root.classList.remove('landing-scroll');
  }, []);

  return <HeroPinnedScene />;
}
