# Changelog

All notable changes to this project will be documented in this file.

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
