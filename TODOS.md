# TODOS

## Service Layer (Phase 2)

- **RfpService.createRfp 추출** — `createRfpAction` (389줄) 비즈니스 로직을 `RfpService.createRfp`로 분리. bizProfile 3분기·nextRfpId·attachment link·invitation batch 포함.
  **Priority:** P1

- **RfpService.sendDraftInvitations 추출** — `sendDraftInvitationsAction` (225줄) → 서비스 위임.
  **Priority:** P1

- **RfpService.createPgRequest / acceptPgRequest / rejectPgRequest / addPgWorkspaces 추출** — 콜드 피치·allowlist 로직.
  **Priority:** P1

- **BidService.submit / addNote / removeNote 추출** — `submitBidAction`·`addBidNoteAction`·`removeBidNoteAction` 비즈니스 로직.
  **Priority:** P1

## Service Layer (Technical Debt)

- **N+1 알림 팬아웃 개선** — `RfpService.award/cancel/close`의 `workspaceRepo.memberUserIds` 호출이 PG 워크스페이스당 1 SELECT. `memberUserIdsBatch(wsIds[])` 추가로 단일 IN-절 쿼리로 교체.
  **Priority:** P2

- **`BidService.withdraw` 낙찰 후 철회 방지** — 낙찰된 RFP의 winning bid를 철회 가능한 버그(pre-existing). `withdraw()` 내 rfp.status 확인 추가 필요.
  **Priority:** P2

- **Action 테스트 smoke-only 축소** — `award.test.ts`·`cancel.test.ts`·`close.test.ts` 액션 테스트가 서비스 테스트와 중복 커버리지. 세션/파싱 smoke만 남기고 비즈니스 로직 케이스 서비스 테스트로 이전.
  **Priority:** P3

- **`Actor`/`ServiceResult` 타입 공유 파일로 추출** — `rfp.ts`·`bid.ts` 양쪽에 동일 타입 선언. `lib/server/services/types.ts`로 추출.
  **Priority:** P3

## Completed
