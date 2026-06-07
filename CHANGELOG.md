# Changelog

All notable changes to this project will be documented in this file.

## [0.1.4] - 2026-06-07

### Added

- **견적 요청 홈페이지 URL 형식 검증**: 새 견적 요청(`/rfp/new`) 작성 위저드 Step 2의 '사업 운영 홈페이지'(`websiteUrl`) 입력에 도메인 형식 유효성 검증을 추가. 선택 필드라 빈 값은 그대로 허용하되, 값을 입력하면 `http(s)://` 스킴 + 점(.)+TLD 도메인 형태여야 한다. 형식이 어긋나면 입력 즉시 인라인 안내(`role="alert"`)를 보여주고 발송을 막는다(위저드 Step 2 미완료 처리 + 서버 `createRfpAction` zod 검증). `https://trusted.com@evil.com`처럼 표시 host와 실제 목적지가 다른 userinfo 형태도 거부 — 홈페이지가 오픈 게시판에 링크로 노출되므로 피싱을 차단한다.

## [0.1.3] - 2026-06-07

### Fixed

- **견적 요청 위저드 사이드바 스크롤**: 새 견적 요청(`/rfp/new`) 작성 위저드에서 좌측 단계 네비게이션(사업자 확인·견적 내용·PG 선택·보내기 확인) 위에 마우스를 올려 스크롤하면 폼이 아니라 화면 전체가 스크롤되던 버그 수정. 스크롤 컨테이너를 위저드 루트로 통일하고 좌측 사이드바를 sticky로 고정해, 좌·우 어느 영역에서 스크롤해도 견적 내용 영역과 동일하게 폼만 스크롤되도록 변경.

## [0.1.2] - 2026-06-07

### Fixed

- **채팅 첨부파일 ACL**: `canAccessAttachment`에서 `chatMessageId` 분기가 누락되어 상대방이 파일을 다운로드 시 403이 발생하던 버그 수정. 대화 양쪽 워크스페이스(buyer·PG) 모두 허용.
- **채팅 실시간 첨부 표시**: `publishChatEvent` 페이로드에 `attachments` 필드가 없어 상대방이 메시지를 실시간으로 받았을 때 첨부 타일이 렌더되지 않던 버그 수정 — 페이로드에 파일 메타데이터 포함.
- **ThreadView `onMessage` 핸들러**: 수신된 실시간 메시지의 `attachments`를 항상 빈 배열로 덮어쓰던 버그 수정 — 페이로드의 `attachments` 값을 실제로 사용하도록 변경.

## [0.1.1] - 2026-06-07

### Removed

- **공유 링크 기능 완전 제거**: 견적 요청 상세 페이지에서 '공유 링크' 섹션(URL 입력 + 복사 버튼)이 제거됨.
  PG 초대는 워크스페이스 직접 초대 또는 오픈 게시판 콜드 피치 경로만 사용.
- `/share/rfp/[token]` 공개 라우트 삭제 — 토큰 기반 비인증 접근 경로 완전 제거.
- `claimShareTokenAction` 서버 액션 삭제.
- RFP 생성 시 `share_token` 자동 발급 중단. DB 컬럼은 하위 호환 보존.
