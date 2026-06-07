# TODOS

## Service Layer (Technical Debt)

- **N+1 알림 팬아웃 개선** — `RfpService.award/cancel/close`의 `workspaceRepo.memberUserIds` 호출이 PG 워크스페이스당 1 SELECT. `memberUserIdsBatch(wsIds[])` 추가로 단일 IN-절 쿼리로 교체.
  **Priority:** P2

- **`BidService.withdraw` 낙찰 후 철회 방지** — 낙찰된 RFP의 winning bid를 철회 가능한 버그(pre-existing). `withdraw()` 내 rfp.status 확인 추가 필요.
  **Priority:** P2

- **Action 테스트 smoke-only 축소** — `award.test.ts`·`cancel.test.ts`·`close.test.ts` 액션 테스트가 서비스 테스트와 중복 커버리지. 세션/파싱 smoke만 남기고 비즈니스 로직 케이스 서비스 테스트로 이전.
  **Priority:** P3

## Completed

- **`Actor`/`ServiceResult` 타입 공유 파일로 추출** — `lib/server/services/types.ts`로 추출 완료 (Phase 2 전처리).

- **BidService.submit / addNote / removeNote 추출** — `submitBidAction`·`addBidNoteAction`·`removeBidNoteAction` 서비스 위임 완료 (Phase 2a, PR #128).

- **RfpService.createPgRequest / acceptPgRequest / rejectPgRequest / addPgWorkspaces 추출** — 콜드 피치·allowlist 로직 서비스 위임 완료 (Phase 2b, PR #128).

- **RfpService.sendDraftInvitations 추출** — 서비스 위임 완료 (Phase 2b, PR #128).

- **RfpService.createRfp 추출** — bizProfile 3분기·nextRfpId·attachment link·invitation batch 서비스 위임 완료 (Phase 2b, PR #128).
