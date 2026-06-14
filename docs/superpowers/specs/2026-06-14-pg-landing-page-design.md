# PG사 랜딩페이지 설계안 (2026-06-14)

## 목적

`partner.supporter-b.com`(PG 호스트)에 노출되는 PG 영업담당자용 랜딩페이지를 구축한다.
핵심 메시지 두 축:
1. **신규 성장 고객사 인바운드** — "Supporter B가 새로운 고객사를 가져다준다."
2. **검증된 리드 / 공정한 기회** — "그냥 리드가 아니라 검증된 리드, 특정 PG에 몰아주지 않는 공정한 기회."

현재 `components/landing/PgLanding.tsx`는 "PG 랜딩화면" placeholder. 이를 8개 섹션 풀랜딩으로 교체한다.

## 진입 / 라우팅

`app/page.tsx`의 PG 분기(`hostServes(host) === 'pg' → <PgLanding/>`)는 변경하지 않는다.
PgLanding은 자체 헤더+푸터를 가진 self-contained 서버 컴포넌트(내부에 client 섹션 포함).

## 8개 섹션 ↔ 컴포넌트

| # | 섹션 | 컴포넌트 | 신규/재사용 | 인터랙션 |
|---|---|---|---|---|
| — | 헤더 | `PgLandingHeaderNav`(서버,auth) → `PgLandingNav`(client) | 신규 | PG 앵커 + 상담 CTA + 로그인/앱이동 |
| 1 | Hero | `PgHeroSection`(client) | 신규 | 두 메인 카피 크로스페이드 자동 전환 + 상담 CTA |
| 2 | PG 영업 문제 제기 | `SectionHeading` + `ProblemCard`×4 + `FadeInView` | 재사용 | 스크롤 리빌 |
| 3 | 신규 성장 고객사 인바운드 | 임팩트카피 + `PgCustomerCarousel`(client) + 마무리 문구 | 신규 | 좌우 캐러셀(prev/next·dots·자동전환) |
| 4 | 검증된 리드 / 공정한 기회 | `SectionHeading` + `PgFeatureCard`×3 | 신규(presentational) | 스크롤 리빌 |
| 5 | 참여 프로세스 | `PgProcessSteps`(5단계) + 상담 CTA | 신규(presentational) | — |
| 6 | 핵심 이점 | `SectionHeading` + `PgFeatureCard`×6 그리드 | 신규(presentational) | — |
| 7 | FAQ | `FaqList`(items prop 파라미터화) + `pg-faq-data.ts`(7문항) | 재사용+확장 | 항상 펼침 |
| 8 | 최종 CTA | 다크 섹션 + `ConsultButton`(primary) + `ConsultButton`(secondary) | 신규 | 둘 다 채널톡 |
| — | 푸터 | `components/shell/Footer` | 재사용 | — |

## CTA 와이어링 (확정)

모든 행동 유도는 채널톡으로 연결한다. `ConsultButton`(client)가 클릭 시
`window.ChannelIO?.('showMessenger')`를 호출한다(기존 `SidebarFooterControls` 패턴 그대로).
- "파트너 상담 신청" (히어로·5단계·최종 CTA primary)
- "제휴 소개서 받기" (최종 CTA secondary) — 동일하게 채널톡

variant: `primary`(파란 채움), `on-dark`(다크 섹션), `ghost`(소개서 보조버튼).

## 카피 처리 (확정)

- 스펙 **화면3 중복**: 첫 버전 카드가 화면2 문제카드 복붙 오류 → **두 번째 버전(고객사 유형 4블록)** 채택.
  - 임팩트카피: "콜드콜보다 빠르게. / 광고 리드보다 선명하게. / 실제 결제 조건을 비교하는 고객사를 만나세요."
  - 캐러셀 4카드: ① PG 변경을 검토하는 기존 가맹점 ② 신규 PG 도입을 준비하는 성장 기업 ③ 조건 개선 니즈가 명확한 고객사 ④ 복수 PG 조건을 비교하는 구매 의사 보유 고객사
  - 마무리: "Supporter B는 'PG 조건을 비교하고 싶다'는 명확한 신호가 있는 고객사를 먼저 선별합니다."
- 히어로 오타 `파트너 치널` → `파트너 채널` 교정.
- 히어로 두 메인 카피(크로스페이드):
  - A: "성장하는 신규 가맹점을 가장 빠르게 만나는 파트너 채널 Supporter B"
  - B: "확실하게 도입 의사가 있는 가맹점을 가장 빠르게 만나는 파트너 채널 Supporter B"
- 카피 상수는 buyer `LandingHero` 패턴대로 `PgLanding.tsx` 상단 인라인, FAQ만 `pg-faq-data.ts` 분리.

## 디자인 / 모션 (Linear 하드룰 준수)

buyer 랜딩과 동일 토큰: `max-w-[1080px]`, `--md-sys-color-*`, `SectionHeading`/`FadeInView`
모션(transform·opacity·once), `.landing-scroll` 스무스 스크롤 + 섹션 `scroll-mt`, mono eyebrow,
6px radius, 저대비 보더. 크로스페이드/캐러셀 모두 transform·opacity만, `prefers-reduced-motion` 시 정적.
nav 섹션 앵커: `#problem` · `#inbound` · `#process` · `#benefits` · `#faq`.

## SEO

PgLanding 내부에 `Organization` + `FAQPage`(PG_FAQ_ITEMS) JSON-LD 추가(현재 PG 분기엔 없음 — additive).

## TDD 계획 (RED 먼저)

상태/핸들러/로직 있는 것만 테스트 선행:
- `useCrossFadeRotation` — fake timers·인덱스 전진·wrap·reduced-motion 정지
- `PgCustomerCarousel` — next/prev/wrap, 활성 카드 렌더, dots
- `ConsultButton` — 클릭 시 `ChannelIO('showMessenger')` 호출
- `FaqList` items prop — 전달한 items 렌더
- `PgLanding` 스모크 — 주요 섹션 제목/CTA 렌더(기존 `PgLanding.test.tsx` 갱신)

순수 presentational(`PgFeatureCard`/`PgProcessSteps`/`PgHeroSection` 마크업/`PgLandingNav`)은
composition 스모크로 커버(시각/스타일 변경은 TDD 면제).

## 작업 방식

worktree `feat/pg-landing-page`(base origin/dev)에서 TDD 빌드 → green 확인 →
design/code 어드버사리얼 리뷰 → `/ship`. DB/env 변경 없음.
