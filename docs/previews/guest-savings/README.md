# 공개 작성 완료 계산기

실제 `/quote-start` 완료 화면을 로컬 Chromium에서 촬영했습니다. 설계 시안이 아닙니다.

- [데스크톱 화면](desktop.png) — 1100px
- [모바일 화면](mobile.png) — 320px
- [슬라이더 조작 GIF](slider.gif) — 드래그 중 즉시 계산, 손을 놓은 후 증가 효과

회귀 검증: `e2e/guest-savings.spec.ts` (320px, 1440px, 200% CSS 확대, 키보드, Chromium 터치 이벤트, 초안 분리, 수정 후 복귀). CSS 확대는 운영체제·브라우저 메뉴의 네이티브 확대와 별개입니다.
