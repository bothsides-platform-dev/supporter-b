# 딜룸 소형 화면 콘텐츠 미노출 버그 수정

**날짜**: 2026-06-20  
**종류**: 버그 픽스

## 문제

`/inbox/[rfpId]`(PG 딜룸) 및 `/rfp/[id]`(구매사 딜룸)에서 화면 너비가 `lg(1024px)` 미만으로 줄어들면 중앙 콘텐츠 영역(`DealRoomCenter`)이 완전히 사라진다. 상단 액션 탭 바만 남고 본문이 빈 흰색으로 보인다.

## 근본 원인

`PgDealRoomBody`와 `BuyerDealRoomBody`의 ActionRail + Center를 감싸는 div:

```tsx
<div className="flex min-h-0 flex-1">   {/* flex-row 기본값 */}
  <DealRoomActionRail />                  {/* max-lg: w-full flex-row (가로 바) */}
  <div className="min-w-0 flex-1">        {/* min-w-0 → shrink to 0 */}
    <DealRoomCenter />
  </div>
</div>
```

`lg` 미만에서 `DealRoomActionRail`이 `max-lg:w-full`(100%)로 변환되지만 부모가 `flex-row`이므로 `Center` div가 `min-w-0` 덕분에 너비 0으로 압착된다.

## 수정

두 파일의 해당 div에 `max-lg:flex-col` 추가:

```diff
// PgDealRoomBody.tsx
- <div className="flex min-h-0 flex-1">
+ <div className="flex min-h-0 flex-1 max-lg:flex-col">

// BuyerDealRoomBody.tsx
- <div className="flex min-h-0 flex-1">
+ <div className="flex min-h-0 flex-1 max-lg:flex-col">
```

`max-lg` 에서 부모가 `flex-col`로 바뀌면:
- ActionRail(전체 너비 가로 바)이 상단에 위치
- Center가 남은 높이(`flex-1`)를 채우며 정상 표시

## 결과 레이아웃 (max-lg)

```
┌──────────────────────────────────┐
│ 견적작성 │ 요청보기 │ 첨부 │ 철회  │  ActionRail (가로 바)
├──────────────────────────────────┤
│                                  │
│        DealRoomCenter            │  flex-1
│                                  │
└──────────────────────────────────┘
```

## 영향 범위

- `components/deal-room/pg/PgDealRoomBody.tsx` — 1줄
- `components/deal-room/buyer/BuyerDealRoomBody.tsx` — 1줄
- DDL/env 변경 없음

## 테스트

- 각 Body 컴포넌트의 기존 단위 테스트에 `lgUp=false` 시나리오 추가 — Center가 DOM에 존재하는지 확인
- `pnpm test components/deal-room`
