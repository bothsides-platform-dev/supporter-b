# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-06-07

### Removed

- **공유 링크 기능 완전 제거**: 견적 요청 상세 페이지에서 '공유 링크' 섹션(URL 입력 + 복사 버튼)이 제거됨.
  PG 초대는 워크스페이스 직접 초대 또는 오픈 게시판 콜드 피치 경로만 사용.
- `/share/rfp/[token]` 공개 라우트 삭제 — 토큰 기반 비인증 접근 경로 완전 제거.
- `claimShareTokenAction` 서버 액션 삭제.
- RFP 생성 시 `share_token` 자동 발급 중단. DB 컬럼은 하위 호환 보존.
