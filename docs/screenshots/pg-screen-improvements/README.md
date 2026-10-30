# PG 로그인 후 화면 — Before / After

2026-10-30 Playwright Chromium으로 변경 전·후 화면을 다시 캡처했다. Before는 기준 커밋 `c7e0f91ae2d10ef30adfc0566a74f4b20854c929`, After는 구현 커밋 `70142a6f9ee471c2a794f0ad5dcf849ea1e854a1`이다.

두 개발 서버가 같은 `supporter_b_test`의 가상 구매사·PG·템플릿·메시지·알림 데이터를 사용한다. 각 쌍은 같은 화면 크기·테마·모션 감소 설정으로 캡처했다. Next.js 개발 도구 표시만 양쪽에서 숨겼다. 모바일 템플릿은 수수료 영역 시작점까지 스크롤했다. 사진 편집은 하지 않았다.

| 화면 | Before | After | 크기·테마 |
|---|---|---|---|
| 받은 견적 요청 | [Before](before-inbox-desktop-light.png) | [After](inbox-desktop-light.png) | 1440×1000 · 밝게 |
| 요청 조건·견적 작성 | [Before](before-workspace-desktop-dark.png) | [After](workspace-desktop-dark.png) | 1440×900 · 어둡게 |
| 템플릿 편집 | [Before](before-template-desktop-light.png) | [After](template-desktop-light.png) | 1440×900 · 밝게 |
| 모바일 홈 | [Before](before-home-mobile-light.png) | [After](home-mobile-light.png) | 375×900 · 밝게 |
| 모바일 템플릿 | [Before](before-template-mobile-light.png) | [After](template-mobile-light.png) | 375×900 · 밝게 |
| 모바일 알림 | [Before](before-notifications-mobile-light.png) | [After](notifications-mobile-light.png) | 375×900 · 밝게 |

구현 검증에서는 375·768·1280·1440px의 밝은/어두운 테마와 모션 감소 설정을 확인했다. 키보드 오류 초점 이동, 템플릿 메뉴 닫기 후 포커스 복귀, 모바일 메시지 검색·선택 유지, 작성 단계·입력·스크롤 보존도 검증했다. 1440px 화면의 200% 확대에 해당하는 720 CSS px / 배율 2 환경에서 넘침을 확인했다.

로컬 Turbopack 인터셉트 라우팅에서 견적번호에 `(.)`가 붙는 기존 현상이 재현됐다. 상세 이전·다음 이동은 별도 Webpack 개발 서버에서 정상 확인했다. 전체 단위 테스트 9,313건, PG 견적 제출·튜토리얼 E2E 7건, 타입 검사와 lint가 통과했다.
