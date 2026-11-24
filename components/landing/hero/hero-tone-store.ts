'use client';

import { create } from 'zustand';

// 히어로 색 상태 — 제휴 PG 로고에 마우스를 올리면 그 브랜드 색을 히어로 ASCII 궤적에 섞는다.
// 쓰기는 LandingPartnerMarquee, 읽기는 HeroAsciiField. (헤더 톤 전환은 2026-11-23 A안에서 제거했다.)
type HeroToneState = {
  partnerAccent: string | null;
  setPartnerAccent: (color: string | null) => void;
};

export const useHeroToneStore = create<HeroToneState>((set) => ({
  partnerAccent: null,
  setPartnerAccent: (partnerAccent) => set((s) => s.partnerAccent === partnerAccent ? s : { partnerAccent }),
}));
