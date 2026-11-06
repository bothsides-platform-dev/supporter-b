# 이벤트 위치 설명용 화면

- 캡처일: 2026-11-06
- 설명과 번호 연결표: [이벤트 목록 §12](../../ANALYTICS_EVENT_INVENTORY_2026-11-06.md#12-화면과-클릭-위치)
- 01~14: 저장소의 실제 컴포넌트를 임시 로컬 Next.js 화면에서 예시 데이터로 렌더링한 브라우저 캡처. 설명 배너와 번호는 캡처 페이지 DOM에 추가했다. 제품 코드는 수정하지 않았다.
- 15~16: 운영 공개 페이지 `https://docs.support-b.com/tools/utm` 조회 화면. 별도 번호 없음.
- 원본 브라우저 캡처의 JPEG 바이트를 그대로 저장했다. 파일 확장자만 실제 형식에 맞췄으며 이미지 합성·픽셀 편집은 하지 않았다.
- 회사·이메일·사업자번호·검증 상태·PG·수수료는 예시다. 가입·인증·상담을 실제 제출한 결과나 GA 수신 증빙이 아니다.
- 실제 화면과 다른 부분: 문서용 상단 안내, 단순화된 주변 레이아웃, 04의 첨부 업로더 대신 예시 안내문, 추천 API 응답 대신 데모 데이터.

| 파일 | 사용한 컴포넌트·화면 |
| --- | --- |
| 01-question, 02-contract, 03-edit, 04-finish | `components/rfp/RfpQuestionFlow.tsx` |
| 05-email | `components/auth/BuyerSignupEmailForm.tsx` |
| 06-company | `components/auth/BuyerSignupWorkspaceForm.tsx` |
| 07-profile | `components/auth/BuyerSignupProfileForm.tsx` |
| 08-verify | `components/pending-approval/EmailVerifyScreen.tsx` |
| 09-approval | `components/pending-approval/ApprovalWaitingScreen.tsx` |
| 10-business | `components/rfp/RfpStep1BizProfile.tsx` |
| 11-review | `components/rfp/RfpStep4Review.tsx` |
| 12-guest, 13-automatic | `components/rfp/GuestMatchingReview.tsx` |
| 14-landing | `components/landing/LandingHeroSection.tsx` |
| 15-insights-utm, 16-insights-actions | 운영 인사이트 `/tools/utm` |

MD 파일을 다른 곳으로 전달할 때는 이미지가 보이도록 이 폴더도 같은 상대 경로로 함께 전달한다.
