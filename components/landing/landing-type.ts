// 랜딩(구매사·PG) 공통 타이포 스케일.
// 섹션마다 제각각이던 임의 clamp/px 크기를 한 출처로 통일한다. 색·max-width 등 맥락별
// 속성은 사용처에서 덧붙인다. h2(SectionHeading)와 히어로 디스플레이는 화면 고유 처리라 제외.
// 한글은 word-break 기본값에서 어절 중간이 아닌 글자 단위로 끊겨 줄 끝이 어색해진다.
// break-keep(word-break: keep-all)로 어절을 보존하고, text-balance/pretty로 고아줄을 줄인다.
export const LANDING_TYPE = {
  // 모노 eyebrow 라벨 (— 도입문의 / 가맹점 등급 등)
  eyebrow: 'font-mono text-sm tracking-[0.1em] uppercase',
  // 섹션 소제목 · 카드 제목
  heading3:
    'text-[clamp(20px,2.8vw,30px)] font-medium leading-[1.25] tracking-[-0.016em] text-balance break-keep',
  // 섹션 인트로 · 리드 문단
  lead: 'text-[clamp(16px,2vw,21px)] leading-[1.65] tracking-[-0.008em] text-pretty break-keep',
  // 일반 본문 문단
  body: 'text-[clamp(15px,1.6vw,17px)] leading-[1.7] tracking-[-0.006em] text-pretty break-keep',
} as const;
