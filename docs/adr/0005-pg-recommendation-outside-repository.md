---
status: accepted
---

# PG 추천 평가는 repository 밖 pure module 에 둔다

맞춤 PG 상담의 추천 산출(Black/Gray 정책, 기본 PG 폴백, 비활성·테스트·현재·이전 상담 PG 제외, 등급별 요율)은 `DrizzlePgMatchingRepository.recommendation()` 안에 있었고, 위치 인자 8개를 받는 그 메서드를 5개 module 의 6곳이 각자 `resolveIndustry → resolveCurrentPgs → recommendation` 순서를 외워 불렀다(quote-savings 는 현재 PG 해석을 빠뜨렸다). 규칙이 Drizzle adapter 안에 있어 PGlite 없이는 검증할 수 없었다. 이제 `lib/rfp/pg-recommendation-rules.ts` 의 pure 함수가 규칙을 소유하고, `lib/server/services/pg-recommendation.ts` 의 `PgRecommendationService.recommend()` 하나가 두 종류 요청(새 선택 / 저장된 상담 스냅샷)을 받아 업종·현재 PG·등급 해석과 후보 산출을 한 번에 돌려준다. repository 는 상담 요청·심사의 영속과 원시 읽기(업종 그룹·정책 원문·기본 정책·PG 워크스페이스·구매사 등급)만 맡으며, DB 접근은 여전히 `repositories/**` 에만 있다. 평가 규칙은 admin 레포와 글자 단위로 공유하는 저장 계약(`lib/rfp/pg-matching.ts`)을 키우지 않고 sibling 에서 스키마만 import 한다. 심사 전이(review / next / endAndNext)는 RFP 행 잠금·알림·초대를 함께 다루는 다른 책임이라 `PgMatchingService` 에 남고 이 module 의 소비자가 된다. 멱등 판정·선택 PG 게이트는 호출처에 남긴다 — module 이 requestKey 를 알면 RFP 생성 책임과 다시 섞인다.
