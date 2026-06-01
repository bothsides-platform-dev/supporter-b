# Buyer Home — Onboarding Action List

**Date:** 2026-06-01  
**Status:** Approved

## Problem

신규 가입 구매사가 홈 화면(`/home`)에 접근했을 때 `sent` 상태 RFP가 없으면 `groups.length === 0`이 되어 "지금 처리할 일이 없습니다" 빈 상태가 표시된다. 아직 RFP를 보내지 않은 신규 사용자는 다음 단계를 알 수 없다.

## Goal

`sent` RFP가 없는 동안(= 온보딩 구간) 빈 상태 대신 추천 액션 목록을 표시한다. 첫 RFP 발송 시 자동으로 정규 ActionQueue로 전환된다.

## UI — Option C: 배너 CTA + 보조 리스트

```
┌─────────────────────────────────────────────────────┐
│  첫 RFP를 작성해 보세요                    [RFP 작성하기] │
│  PG사를 초대하고 수수료 견적을 비교할 수 있어요          │
└─────────────────────────────────────────────────────┘
  🏢 워크스페이스 프로필 설정                           ›
  👥 팀원 초대하기                                      ›
```

- `actions[0]` → 파란 배너 CTA (제목 + description + "RFP 작성하기" 버튼)
- `actions[1..]` → 보조 리스트 아이템 (텍스트 + `›` 화살표)

기존 빈 상태("지금 처리할 일이 없습니다")는 삭제하지 않는다 — `onboardingActions`가 `null`이고 `groups`도 빈 경우(sent RFP가 있었다가 모두 마감·취소)에 사용된다.

## 표시 조건

| 조건 | 결과 |
|---|---|
| `sent.length === 0` (RFP 없음 또는 draft만 있음) | `onboardingActions` = 3개 액션 배열 |
| `sent.length >= 1` | `onboardingActions = null` → ActionQueue 또는 EmptyState |

## 아키텍처

### 1. 데이터 모델 (`lib/server/dashboard/buildDashboard.ts`)

```ts
export type OnboardingAction = {
  id: string;
  href: string;
  title: string;
  description: string;
};

// Dashboard 타입에 추가
export type Dashboard = {
  kpis: DashboardKpi[];
  groups: ActionGroup[];
  onboardingActions: OnboardingAction[] | null;
};
```

### 2. `buildBuyerDashboard` 로직

```ts
const BUYER_ONBOARDING_ACTIONS: OnboardingAction[] = [
  { id: 'create-rfp',     href: '/rfp/new',          title: '첫 RFP를 작성해 보세요',  description: 'PG사를 초대하고 수수료 견적을 비교할 수 있어요' },
  { id: 'setup-profile',  href: '/settings/profile', title: '워크스페이스 프로필 설정', description: '' },
  { id: 'invite-members', href: '/settings/members', title: '팀원 초대하기',            description: '' },
];

return {
  kpis,
  groups,
  onboardingActions: sent.length === 0 ? BUYER_ONBOARDING_ACTIONS : null,
};
```

`buildPgDashboard`는 `onboardingActions: null` 고정 반환.

### 3. UI 컴포넌트

**신규: `components/home/OnboardingActionList.tsx`**

props: `{ actions: OnboardingAction[] }`

**`HomeDashboard.tsx` 분기 변경 (3단):**

```tsx
{dashboard.groups.length > 0 ? (
  <ActionQueue groups={dashboard.groups} />
) : dashboard.onboardingActions ? (
  <OnboardingActionList actions={dashboard.onboardingActions} />
) : (
  <EmptyState icon={<CheckIcon />} title="지금 처리할 일이 없습니다" ... />
)}
```

## 테스트

**`lib/server/dashboard/__tests__/buildDashboard.test.ts` 추가:**
- `sent RFP 없음 → onboardingActions 3개 반환, actions[0].id === "create-rfp"`
- `sent RFP 1개 이상 → onboardingActions === null`
- 기존 케이스에 `onboardingActions: null` 기대값 명시

**`components/home/__tests__/OnboardingActionList.test.tsx` 신규:**
- `actions[0]`이 `/rfp/new` href를 가진 배너로 렌더링
- `actions[1]`, `actions[2]`가 각각 올바른 href로 보조 리스트 렌더링
- `actions: []` 시 아무것도 렌더링하지 않음

## 변경 파일 요약

| 파일 | 변경 종류 |
|---|---|
| `lib/server/dashboard/buildDashboard.ts` | 타입 추가 + 로직 변경 |
| `lib/server/dashboard/__tests__/buildDashboard.test.ts` | 테스트 추가 |
| `components/home/HomeDashboard.tsx` | 3단 분기 변경 |
| `components/home/OnboardingActionList.tsx` | 신규 |
| `components/home/__tests__/OnboardingActionList.test.tsx` | 신규 |
