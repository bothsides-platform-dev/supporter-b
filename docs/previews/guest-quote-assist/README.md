# 공개 견적 자동 입력·맞춤 절감액 화면

2026-10-29, 실제 `/quote-start`를 로컬 Chromium에서 촬영했다. 기능 플래그를 설정하지 않았고 감소 모션을 적용했다. 회사명·PG·업종·요율은 테스트 데이터이며 실제 고객 견적이 아니다. 이미지 편집 없이 원본 캡처를 보관한다.

- [제안 확인 · 모바일 390px](review-mobile.png): `e2e/guest-quote-assist.spec.ts`의 AI 사용 불가 응답을 HTTP 경계에서 재현했다. 규칙 기반 상품 제안과 직접 입력한 회사명을 함께 확인한다.
- [신규 절감액 · 모바일 390px](savings-mobile.png): `e2e/guest-savings.spec.ts`의 테스트 DB 정책·표준 요율을 서버에서 계산했다. 예상 연매출 3억 원 이하, 연간 카드 거래액 1억 2천만 원, 표준 3%·제안 1%로 연간 240만 원을 표시한다.
- [신규 절감액 · PC 1280px](savings-desktop.png): 동일 결과의 데스크톱 배치다.

[변경 전 고정값 계산기](../guest-savings/README.md) · [구현·운영·실호출 검증 기록](../../GUEST_QUOTE_ASSIST.md)
