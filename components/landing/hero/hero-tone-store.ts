'use client';

import { create } from 'zustand';

// 랜딩 헤더 톤 상태 — 히어로 다크 오프닝 씬 위에서는 헤더가 투명 배경+라이트 텍스트(over-dark),
// 라이트 리빌을 지나면 기존 surface+border로 돌아온다. 쓰기는 HeroPinnedScene(스크롤 진행),
// 읽기는 LandingHeader/LandingNav. SSR 초기값은 over-dark — 첫 페인트가 다크 씬이므로
// 하이드레이션 전에도 올바른 모습이고, 앵커 딥링크 진입은 마운트 직후 동기화로 바로잡는다.
type HeroToneState = {
  overDark: boolean;
  setOverDark: (v: boolean) => void;
};

export const useHeroToneStore = create<HeroToneState>((set) => ({
  overDark: true,
  // 스크롤 틱마다 불리므로 값이 같으면 상태 객체를 유지해 구독자 알림을 생략한다.
  setOverDark: (v) => set((s) => (s.overDark === v ? s : { ...s, overDark: v })),
}));
