# 온보딩 시작점을 홈 화면으로 이동

## 배경

현재 "샘플로 둘러보기" 온보딩 진입 카드(`SampleEntryCard`)는 목록 페이지에만 노출된다:

- buyer: `/rfp` (견적 요청 목록) 헤더 아래 + 빈 상태 위
- pg: `/inbox` (받은 견적 요청 목록) 동일 패턴

신규 유저가 로그인 후 가장 먼저 보는 화면은 홈(`/home`)이지만, 온보딩 진입점이 홈에는 없어 목록 페이지로 이동해야만 발견할 수 있다. 이 스펙은 **진입점의 위치만** 홈으로 옮긴다.

## 범위

**포함**:
- `SampleEntryCard`를 홈 화면(`HomeDashboard`)에 렌더링
- 목록 페이지(`/rfp`, `/inbox`)에서 기존 카드 제거 (중복 노출 없음 — 홈으로만 이동)

**제외 (변경 없음)**:
- 샘플 딜룸 플로우 자체 (`SampleBuyerDealRoom`, `SamplePgDealRoom`, `/rfp/sample`, `/inbox/sample` 라우트)
- `users.onboarding` jsonb 데이터 구조, `shouldShowSampleEntry` 판정 로직, 완료/숨기기(dismiss) 동작
- 샘플 픽스처(`lib/onboarding/fixtures.ts`)

## 변경 사항

### 1. `app/(app)/rfp/page.tsx`, `app/(app)/inbox/page.tsx`

`SampleEntryCard` 렌더링 지점 2곳(헤더 옆, 빈 상태 위)을 제거한다. 이에 딸린 `getOnboarding` 조회, `shouldShowSampleEntry` 판정, 관련 import(`SampleEntryCard`, `shouldShowSampleEntry`)도 함께 삭제한다. 실제 샘플 RFP는 DB에 존재하지 않는 가상 데이터(`SAMPLE_RFP_CODE`)라 목록 쿼리(`findByBuyerWs` 등) 자체에는 영향이 없다 — 카드만 사라진다.

### 2. `app/(app)/home/page.tsx`

`BuyerHome`/`PgHome` 호출 시 기존 `workspaceId`에 더해 `userId={session.user.id}`를 전달한다.

### 3. `components/home/BuyerHome.tsx`, `components/home/PgHome.tsx`

`userId` prop을 받아 `getUserRepo().getOnboarding(userId)` → `shouldShowSampleEntry(onboarding, 'buyerSample' | 'pgSample')`를 호출한다(목록 페이지에서 쓰던 것과 동일한 헬퍼, 동일한 판정 로직). 결과를 `showSampleEntry: boolean` prop으로 `HomeDashboard`에 전달한다. 기존 `Promise.all([loadXDashboard, listInboxForViewer])`에 온보딩 조회를 추가해 병렬로 가져온다.

### 4. `components/home/HomeDashboard.tsx`

`showSampleEntry` prop을 받아 true일 때 `<SampleEntryCard variant={workspaceType} />`를 렌더한다.

배치 위치: KPI strip 다음, buyer 전용 "견적 요청하기" CTA 버튼 다음(있는 경우), ActionQueue 이전. 즉:

```
KpiStrip
[buyer] "견적 요청하기" 버튼
SampleEntryCard (showSampleEntry 일 때만)
ActionQueue / EmptyState
...
```

pg는 CTA 버튼이 없으므로 KPI strip 바로 다음에 카드가 온다. buyer/pg 모두 동일한 상대 위치(주요 CTA 다음, 작업 큐 이전)를 유지해 화면 간 일관성을 지킨다.

카드 자체의 동작(클릭 시 `/rfp/sample` 또는 `/inbox/sample`로 이동, X 클릭 시 `updateOnboardingAction`으로 dismissed 처리 후 `router.refresh()`)은 변경하지 않는다 — `SampleEntryCard` 컴포넌트는 그대로 재사용한다.

## 테스트 영향

- `app/(app)/rfp/__tests__/page.test.tsx`, `app/(app)/inbox/__tests__/page.test.tsx`: SampleEntryCard 노출 관련 기존 테스트 제거(더 이상 해당 페이지 책임이 아님)
- `components/home/__tests__/`: 신규 케이스 추가
  - buyer/pg 온보딩 미완료 시 `HomeDashboard`에 `SampleEntryCard` 노출
  - completed/dismissed 시 미노출
  - `BuyerHome`/`PgHome`이 `userId`로 `getOnboarding`을 호출해 결과를 전달하는지

## 리스크 / 참고

- 온보딩 조회가 페이지 하나(목록)에서 두 곳(홈의 buyer/pg 분기)으로 옮겨갈 뿐, 조회 횟수 자체는 동일(페이지 진입당 1회)하다.
- 목록 페이지 코드에서 온보딩 관련 로직을 걷어내면 해당 파일들이 더 단순해진다.
