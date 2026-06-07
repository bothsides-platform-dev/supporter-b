# Changelog

All notable changes to this project will be documented in this file.

## [0.1.4] - 2026-06-07

### Fixed

- **견적 요청 위저드 첨부 파일 빈 스크롤**: 새 견적 요청(`/rfp/new`) 작성 위저드에서 폼·버튼 아래로 거대한 빈 흰 화면이 생기고 그 영역까지 스크롤되던 버그 수정. 원인은 숨김 파일 input이 쓰던 Tailwind `sr-only` 클래스(`position:absolute`)가 긴 폼 안에서 스크롤 컨테이너의 클립을 벗어나 문서 높이를 늘린 것 — `display:none`이 아니라 absolute 박스라 레이아웃에 1px이 남아 문서가 늘어났다. 프로그래밍(`ref.click()`·`<label>`)으로만 열리고 별도 가시 트리거가 있는 숨김 파일 input 5곳을 `hidden`(`display:none`)으로 교체. 첨부 드롭존(`RfpAttachmentDropzone`)·입찰 위저드 견적서 업로드·워크스페이스 로고·메시지/채팅 첨부에 동일 패턴 일괄 적용.

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
