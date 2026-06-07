# TODOS

## Completed

- **`Actor`/`ServiceResult` 타입 공유 파일로 추출** — `lib/server/services/types.ts`로 추출 완료 (Phase 2 전처리).

- **BidService.submit / addNote / removeNote 추출** — `submitBidAction`·`addBidNoteAction`·`removeBidNoteAction` 서비스 위임 완료 (Phase 2a, PR #128).

- **RfpService.createPgRequest / acceptPgRequest / rejectPgRequest / addPgWorkspaces 추출** — 콜드 피치·allowlist 로직 서비스 위임 완료 (Phase 2b, PR #128).

- **RfpService.sendDraftInvitations 추출** — 서비스 위임 완료 (Phase 2b, PR #128).

- **RfpService.createRfp 추출** — bizProfile 3분기·nextRfpId·attachment link·invitation batch 서비스 위임 완료 (Phase 2b, PR #128).

- **N+1 알림 팬아웃 개선** — `WorkspaceRepo.memberUserIdsBatch(wsIds[])` 추가, `award`/`cancel`/`close` N SELECT → 단일 IN-절 쿼리로 교체 완료 (PR #128).

- **`BidService.withdraw` 낙찰 후 철회 방지** — `rfp.status === 'awarded'` 체크 추가, `ALREADY_AWARDED` 오류 반환 완료 (PR #128).

- **Action 테스트 smoke-only 축소** — `award.test.ts`·`cancel.test.ts`·`close.test.ts` 6+4+4 → 2+2+2 케이스 축소 완료 (PR #128).
