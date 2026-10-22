# PG 선정 완료 화면 개선

2026-10-22 Chrome에서 실제 `AwardResult`와 `BuyerDealRoomBody`를 렌더해 캡처했다. 데스크톱은 1440×900, 모바일은 390×844이며 펼친 조건의 스크롤 확인은 390×600이다.

동일한 `demoCompareBids[0]`, `demoCompareCurrent`, `demoBuyerDealData`를 사용했다. 재방문 화면은 선정 상태와 가상 담당자(`onboarding@example.com`)를 넣은 비교 탭이다. 운영 계정·실제 계약·메일 발송 없이 컴포넌트의 변경 전후를 비교한다. 캡처용 임시 페이지는 제거했으며 제품 경로로 추가하지 않았다.

- `before-*`: origin/dev 기준 변경 전 실제 화면
- `after-*`: 개선한 완료·재방문 화면
- `after-expanded-mobile.jpg`: 조건을 펼치고 키보드로 목록 버튼까지 이동한 화면

두 실제 선정 진입점, 목록 이동, 재방문의 기본 합의서 탭과 안내 노출은 별도로 `e2e/scenario-c-buyer-award.spec.ts`에서 검증한다.
