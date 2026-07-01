# Award 상태 딜룸 — 부제목 + 연락처 탭 이동

**날짜**: 2026-06-28
**스코프**: `BuyerDealRoomBody`, `DealResultHeader`, `FocusComparison`

## Context

RFP 선정(award) 후 딜룸에서 "토스페이먼츠를 선정했어요" 문구 아래 다음 행동을 안내하는 부제목이 없고, 담당자 연락처 블록이 탭 위에 노출되어 레이아웃이 분리된다. 연락처가 탭 바깥에 있으면 견적 비교 내용과 시각적으로 분리되어 "선정 후 연락"이라는 흐름이 끊긴다.

## 변경 요약

### 1. 부제목 추가

`DealResultHeader`의 기존 `subtitle` prop을 활용한다.

**파일**: `components/deal-room/buyer/BuyerDealRoomBody.tsx`

```tsx
// before
<DealResultHeader
  tone="award"
  title={`${josa(awardedPgContact.workspaceName, '을/를')} 선정했어요`}
>
  <ContactBlock contact={awardedPgContact} counterpartyKind="pg" />
</DealResultHeader>

// after
<DealResultHeader
  tone="award"
  title={`${josa(awardedPgContact.workspaceName, '을/를')} 선정했어요`}
  subtitle="담당처와 연락을 이어나가보세요."
/>
```

`subtitle` prop은 `DealResultHeader`(`components/deal-room/DealResultHeader.tsx`)에 이미 구현되어 있고 스타일도 완성되어 있다. 추가 컴포넌트 변경 없음.

### 2. ContactBlock을 탭 내부로 이동

`ContactBlock`을 헤더 children에서 제거하고, "견적 비교" 탭 콘텐츠(`FocusComparison`) 위에 배치한다.

**파일**: `components/deal-room/buyer/BuyerDealRoomBody.tsx`

```tsx
// tabs 배열에서 compare 항목
{
  id: 'compare',
  label: '견적 비교',
  content: (
    <>
      {rfp.status === 'awarded' && awardedPgContact && (
        <div className="px-4 pt-3 pb-0">
          <ContactBlock contact={awardedPgContact} counterpartyKind="pg" />
        </div>
      )}
      <FocusComparison {...props} />
    </>
  ),
},
```

## 스타일 결정

- `ContactBlock` 래퍼에 별도 카드 배경(`bg-surface-variant`, 테두리) 추가 없음 — 탭 내부 기본 여백만 사용. 현재 `ContactBlock` 자체 스타일을 그대로 유지.
- `DealResultHeader`의 subtitle 스타일(`pl-7 text-[12px] text-on-surface-variant`)이 디자인 시스템과 일치하므로 변경 없음.

## 데이터 흐름

- `awardedPgContact`는 `BuyerDealRoomBody` props에서 이미 내려오므로 탭 배열 안에서 직접 참조 가능. 추가 fetch 없음.

## 테스트

- `BuyerDealRoomBody` 렌더 테스트: `rfp.status === 'awarded'`일 때 subtitle 텍스트와 ContactBlock이 탭 내부에 렌더되는지 확인
- 비-awarded 상태에서 ContactBlock과 subtitle이 렌더되지 않는지 확인
- `견적 비교` 외 다른 탭 전환 시 ContactBlock이 노출되지 않는지 확인

## 관련 파일

- `components/deal-room/buyer/BuyerDealRoomBody.tsx` — 주요 변경 대상
- `components/deal-room/DealResultHeader.tsx` — subtitle prop 기존 구현 (변경 없음)
- `components/deal-room/ContactBlock.tsx` — 변경 없음
