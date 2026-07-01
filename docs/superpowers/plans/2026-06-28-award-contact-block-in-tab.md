# Award 딜룸 — 부제목 + 연락처 탭 이동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선정 완료 딜룸에서 헤더에 "담당처와 연락을 이어나가보세요." 부제목을 추가하고, 연락처 블록을 탭 위에서 "견적 비교" 탭 내부 상단으로 이동한다.

**Architecture:** `BuyerDealRoomBody.tsx` 단일 파일만 수정한다. `DealResultHeader`의 기존 `subtitle` prop을 활용하고, `ContactBlock`을 `DealResultHeader` children에서 `compare` 탭 콘텐츠 최상단으로 이동한다. 신규 컴포넌트·데이터 fetch·DDL 변경 없음.

**Tech Stack:** React 19, Next.js App Router, TypeScript strict, Vitest + Testing Library

## Global Constraints

- 스타일은 Linear 디자인 시스템 — 별도 카드 배경·그림자 추가 금지
- 탭 콘텐츠는 `DealRoomCenter`가 이미 `px-6 py-5`를 제공하므로 추가 수평 패딩 금지
- TDD: 테스트 RED 확인 후 구현
- 테스트 실행: `pnpm test components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx`

---

## File Map

| 파일 | 변경 |
|------|------|
| `components/deal-room/buyer/BuyerDealRoomBody.tsx` | `DealResultHeader` subtitle 추가, `ContactBlock` 위치 이동 |
| `components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx` | subtitle·탭 내 연락처 테스트 추가 |

---

### Task 1: 테스트 추가 + 구현

**Files:**
- Modify: `components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx`
- Modify: `components/deal-room/buyer/BuyerDealRoomBody.tsx`

**Interfaces:**
- Consumes: `awardedPgContact: { workspaceName: string; name: string; email: string; phone?: string } | null` (기존 `BuyerRfpDetailData`)
- Consumes: `DealResultHeader` — `subtitle?: ReactNode` prop (이미 구현됨, `DealResultHeader.tsx:8`)
- Consumes: `ContactBlock` — `contact`, `counterpartyKind` props (변경 없음)

- [ ] **Step 1: 기존 테스트 파일에 실패 테스트 추가**

`components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx`의 `'BuyerDealRoomBody — 선정 결과 패널'` describe 블록 (line 140) 끝에 아래 두 테스트를 추가한다:

```tsx
  it('awarded 면 "담당처와 연락을 이어나가보세요." 부제목을 렌더한다', () => {
    render(<BuyerDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      awardedPgContact,
    })} />);
    expect(screen.getByText('담당처와 연락을 이어나가보세요.')).toBeInTheDocument();
  });

  it('awarded 면 연락처 이메일 링크가 견적 비교 탭 콘텐츠 영역에 위치한다', () => {
    const { container } = render(<BuyerDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      awardedPgContact,
    })} />);
    // FocusComparison mock(data-testid="focus-comparison")과 같은 스크롤 컨테이너 안에 있어야 한다
    const focusComp = container.querySelector('[data-testid="focus-comparison"]')!;
    const emailLink = screen.getByRole('link', { name: /sales@toss\.im/ });
    expect(focusComp.parentElement).toContainElement(emailLink as HTMLElement);
  });
```

- [ ] **Step 2: 테스트 실행해 RED 확인**

```bash
pnpm test components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx
```

기대 결과: 새로 추가한 두 테스트가 FAIL.
- "담당처와 연락을 이어나가보세요." → `TestingLibraryElementError: Unable to find an element with the text`
- 이메일 링크 위치 → `expect(received).toContainElement(expected)` FAIL (이메일이 헤더에 있어 다른 DOM 위치)

- [ ] **Step 3: BuyerDealRoomBody.tsx 구현 변경**

`components/deal-room/buyer/BuyerDealRoomBody.tsx` 를 다음과 같이 수정한다.

**변경 1 — 헤더: subtitle 추가 + ContactBlock children 제거**

```tsx
// before (line 165-174)
{rfp.status === 'awarded' && awardedPgContact && (
  <div className="shrink-0 px-6 pt-4">
    <DealResultHeader
      tone="award"
      title={`${josa(awardedPgContact.workspaceName, '을/를')} 선정했어요`}
    >
      <ContactBlock contact={awardedPgContact} counterpartyKind="pg" />
    </DealResultHeader>
  </div>
)}

// after
{rfp.status === 'awarded' && awardedPgContact && (
  <div className="shrink-0 px-6 pt-4">
    <DealResultHeader
      tone="award"
      title={`${josa(awardedPgContact.workspaceName, '을/를')} 선정했어요`}
      subtitle="담당처와 연락을 이어나가보세요."
    />
  </div>
)}
```

**변경 2 — 탭: compare 콘텐츠에 ContactBlock 추가**

```tsx
// before (line 77-103)
{
  id: 'compare',
  label: '견적 비교',
  content: (
    <FocusComparison
      bids={bids}
      pgWsNameMap={pgWsNameMap}
      current={{
        feeRate: rfp.currentFeeRate,
        settlementCycle: rfp.currentSettlementCycle,
        settlementLimit: rfp.currentSettlementLimit,
        guaranteeInsurance: rfp.currentGuaranteeInsurance,
      }}
      rfpStatus={rfp.status}
      awardedBidId={rfp.awardedBidId}
      requiredPaymentMethods={rfp.requiredPaymentMethods}
      customPaymentMethods={rfp.customPaymentMethods}
      rfpId={rfp.id}
      rfpCode={rfp.code}
      requoteByPg={requoteByPg}
      buyerGrade={rfp.bizProfile?.grade}
      isSample={rfp.isSample ?? false}
      hideHeader
    />
  ),
},

// after
{
  id: 'compare',
  label: '견적 비교',
  content: (
    <>
      {rfp.status === 'awarded' && awardedPgContact && (
        <div className="mb-4">
          <ContactBlock contact={awardedPgContact} counterpartyKind="pg" />
        </div>
      )}
      <FocusComparison
        bids={bids}
        pgWsNameMap={pgWsNameMap}
        current={{
          feeRate: rfp.currentFeeRate,
          settlementCycle: rfp.currentSettlementCycle,
          settlementLimit: rfp.currentSettlementLimit,
          guaranteeInsurance: rfp.currentGuaranteeInsurance,
        }}
        rfpStatus={rfp.status}
        awardedBidId={rfp.awardedBidId}
        requiredPaymentMethods={rfp.requiredPaymentMethods}
        customPaymentMethods={rfp.customPaymentMethods}
        rfpId={rfp.id}
        rfpCode={rfp.code}
        requoteByPg={requoteByPg}
        buyerGrade={rfp.bizProfile?.grade}
        isSample={rfp.isSample ?? false}
        hideHeader
      />
    </>
  ),
},
```

- [ ] **Step 4: 테스트 실행해 GREEN 확인**

```bash
pnpm test components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx
```

기대 결과: 전체 PASS (기존 7개 + 신규 2개 = 9개)

- [ ] **Step 5: 전체 테스트 스위트 확인**

```bash
pnpm test
```

기대 결과: 기존 전체 green 유지. 실패하면 원인 확인 후 수정.

- [ ] **Step 6: 타입 체크**

```bash
pnpm tsc --noEmit
```

기대 결과: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add components/deal-room/buyer/BuyerDealRoomBody.tsx \
        components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx
git commit -m "feat(deal-room): award 화면 부제목 추가 + 연락처를 견적 비교 탭 내부로 이동"
```
