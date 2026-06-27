# 선정 결과 + 담당자 연락처 화면 개선 (결과 통합형) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선정 종료 후 딜룸에 떠 있던 연락처/미선정 카드를, 각 화면(선정 PG·구매사·미선정 PG)의 '선정 결과' 맥락 안으로 병합해 무게감·위계·맥락을 살린다.

**Architecture:** 공유 프레젠테이션 컴포넌트 3개를 추출(`ContactBlock`·`CopyButton`·`DealResultHeader`)하고, `PgDealRoomBody`/`BuyerDealRoomBody`가 이를 결과 헤더로 조립한다. 봉인입찰 데이터 경계(연락처는 선정된 양쪽만, 서버 로더가 게이트)는 불변 — 변경은 전부 컴포넌트/칩(클라이언트) 레이어와 문서에 한정한다.

**Tech Stack:** Next.js 16 App Router(RSC + 'use client'), React 19, TypeScript strict, Tailwind v4 + CSS 변수 토큰, lucide-react, es-hangul(`josa`), Vitest + @testing-library/react(jsdom).

## Global Constraints

- 테스트 우선(RED→GREEN). 단일 파일 실행: `pnpm test <path>`. 전체: `pnpm test`.
- Linear 디자인 하드룰: pill 버튼 금지(인터랙티브 6px), 큰 그림자 금지(1px 보더), 색은 토큰만(`var(--md-sys-color-*)`). 아바타·상태점만 `rounded-full`. 숫자(전화)는 `.md-numeric`.
- 칩은 `Chip` 컴포넌트만(`ChipColor` = `primary|tertiary|warning|error|surface`). 괄호 평문 상태표기 금지.
- UX 라이팅: 해요체·긍정형. 선정=tertiary 초록 + 체크, 미선정=중립(on-surface/회색) — **빨강(error) 톤 금지**.
- 봉인입찰: 미선정 PG 분기는 어떤 경로로도 상대 연락처를 만들지 않는다(`buyerContact===null` 유지). 승자 신원은 칩/문구로 노출하지 않는다.
- DDL 0, 신규 env 0. 작업 워크트리: `.claude/worktrees/feat+award-result-contact-redesign`(origin/dev 기반).
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: CopyButton (클립보드 복사 버튼)

**Files:**
- Create: `components/deal-room/CopyButton.tsx`
- Test: `components/deal-room/__tests__/CopyButton.test.tsx`

**Interfaces:**
- Consumes: `toast` (`@/lib/toast`), `navigator.clipboard.writeText`.
- Produces: `CopyButton({ value: string; label: string }): JSX.Element` — `aria-label="{label} 복사"`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/deal-room/__tests__/CopyButton.test.tsx
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toastMock(...a) }));

import { CopyButton } from '../CopyButton';

afterEach(() => { cleanup(); toastMock.mockReset(); });

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('CopyButton', () => {
  it('클릭하면 값을 클립보드에 복사하고 성공 토스트를 띄운다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<CopyButton value="sales@toss.im" label="이메일" />);
    fireEvent.click(screen.getByRole('button', { name: '이메일 복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('sales@toss.im'));
    expect(toastMock).toHaveBeenCalledWith('복사했어요', { type: 'success' });
  });

  it('복사가 실패하면 오류 토스트를 띄운다', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('nope')));
    render(<CopyButton value="x" label="전화" />);
    fireEvent.click(screen.getByRole('button', { name: '전화 복사' }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('복사하지 못했어요', { type: 'error' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/deal-room/__tests__/CopyButton.test.tsx`
Expected: FAIL — `Cannot find module '../CopyButton'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/deal-room/CopyButton.tsx
'use client';

import { Copy } from 'lucide-react';
import { toast } from '@/lib/toast';

export function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={`${label} 복사`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast('복사했어요', { type: 'success' });
        } catch {
          toast('복사하지 못했어요', { type: 'error' });
        }
      }}
      className="ml-auto flex shrink-0 items-center gap-1 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-2 py-[3px] text-[11px] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
    >
      <Copy size={12} aria-hidden />
      복사
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/deal-room/__tests__/CopyButton.test.tsx`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add components/deal-room/CopyButton.tsx components/deal-room/__tests__/CopyButton.test.tsx
git commit -m "feat(deal-room): CopyButton — 클립보드 복사 + 토스트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: ContactBlock (담당자 연락처 블록)

**Files:**
- Create: `components/deal-room/ContactBlock.tsx`
- Test: `components/deal-room/__tests__/ContactBlock.test.tsx`

**Interfaces:**
- Consumes: `CopyButton` (Task 1), `DealContact` (`@/lib/server/rfp-detail-loader` — `{ workspaceName: string; name: string; email: string; phone: string | null }`).
- Produces: `ContactBlock({ contact: DealContact; counterpartyKind: 'buyer' | 'pg' }): JSX.Element`. `counterpartyKind='buyer'` → 칩 라벨 `구매사`, `'pg'` → `PG`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/deal-room/__tests__/ContactBlock.test.tsx
import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ContactBlock } from '../ContactBlock';

afterEach(cleanup);

const withPhone = { workspaceName: '토스페이먼츠', name: '김영업', email: 'sales@toss.im', phone: '010-1234-5678' };

describe('ContactBlock', () => {
  it('이름·회사칩(상대 구분)·이메일(mailto)·전화(tel)를 렌더한다', () => {
    render(<ContactBlock contact={withPhone} counterpartyKind="pg" />);
    expect(screen.getByText('김영업')).toBeInTheDocument();
    expect(screen.getByText(/PG · 토스페이먼츠/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sales@toss\.im/ })).toHaveAttribute('href', 'mailto:sales@toss.im');
    expect(screen.getByRole('link', { name: /010-1234-5678/ })).toHaveAttribute('href', 'tel:010-1234-5678');
  });

  it('counterpartyKind=buyer 면 칩 라벨이 구매사다', () => {
    render(<ContactBlock contact={withPhone} counterpartyKind="buyer" />);
    expect(screen.getByText(/구매사 · 토스페이먼츠/)).toBeInTheDocument();
  });

  it('전화가 null 이면 tel 링크와 그 복사 버튼을 렌더하지 않는다(이메일은 유지)', () => {
    render(<ContactBlock contact={{ ...withPhone, phone: null }} counterpartyKind="pg" />);
    expect(screen.queryByRole('link', { name: /010-1234-5678/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전화 복사' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sales@toss\.im/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이메일 복사' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/deal-room/__tests__/ContactBlock.test.tsx`
Expected: FAIL — `Cannot find module '../ContactBlock'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/deal-room/ContactBlock.tsx
import { Mail, Phone } from 'lucide-react';
import type { DealContact } from '@/lib/server/rfp-detail-loader';
import { CopyButton } from './CopyButton';

export function ContactBlock({
  contact,
  counterpartyKind,
}: {
  contact: DealContact;
  counterpartyKind: 'buyer' | 'pg';
}) {
  const kindLabel = counterpartyKind === 'buyer' ? '구매사' : 'PG';
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[14px] font-semibold text-[var(--md-sys-color-on-tertiary-container)]">
          {contact.name.slice(0, 1)}
        </span>
        <div>
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[var(--md-sys-color-on-surface)]">
            {contact.name}
            <span className="rounded-[6px] bg-[var(--md-sys-color-secondary-container)] px-2 py-0.5 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
              {kindLabel} · {contact.workspaceName}
            </span>
          </p>
          <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">담당자</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2.5 text-[13px]">
          <Mail size={15} className="flex-none text-[var(--md-sys-color-on-surface-variant)]" aria-hidden />
          <a href={`mailto:${contact.email}`} className="text-[var(--md-sys-color-primary)] hover:underline">
            {contact.email}
          </a>
          <CopyButton value={contact.email} label="이메일" />
        </div>
        {contact.phone && (
          <div className="flex items-center gap-2.5 text-[13px]">
            <Phone size={15} className="flex-none text-[var(--md-sys-color-on-surface-variant)]" aria-hidden />
            <a href={`tel:${contact.phone}`} className="md-numeric text-[var(--md-sys-color-primary)] hover:underline">
              {contact.phone}
            </a>
            <CopyButton value={contact.phone} label="전화" />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/deal-room/__tests__/ContactBlock.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add components/deal-room/ContactBlock.tsx components/deal-room/__tests__/ContactBlock.test.tsx
git commit -m "feat(deal-room): ContactBlock — 공유 담당자 연락처 블록(복사 버튼)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: DealResultHeader (선정/미선정 결과 헤더)

**Files:**
- Create: `components/deal-room/DealResultHeader.tsx`
- Test: `components/deal-room/__tests__/DealResultHeader.test.tsx`

**Interfaces:**
- Consumes: lucide `CheckCircle2`, `Flag`.
- Produces: `DealResultHeader({ tone: 'award' | 'neutral'; title: string; subtitle?: ReactNode; children?: ReactNode }): JSX.Element`. 제목은 `<h3>`(role=heading). `award`=tertiary 초록 + 체크, `neutral`=on-surface + 회색 깃발.

- [ ] **Step 1: Write the failing test**

```tsx
// components/deal-room/__tests__/DealResultHeader.test.tsx
import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DealResultHeader } from '../DealResultHeader';

afterEach(cleanup);

describe('DealResultHeader', () => {
  it('award 톤은 tertiary(초록) 제목 + subtitle + children 슬롯을 렌더한다', () => {
    render(
      <DealResultHeader tone="award" title="이 견적이 선정됐어요" subtitle="보낸 시각 어제">
        <div data-testid="slot" />
      </DealResultHeader>,
    );
    const h = screen.getByRole('heading', { name: /이 견적이 선정됐어요/ });
    expect(h.className).toContain('--md-sys-color-tertiary');
    expect(screen.getByText('보낸 시각 어제')).toBeInTheDocument();
    expect(screen.getByTestId('slot')).toBeInTheDocument();
  });

  it('neutral 톤은 tertiary(초록)·error(빨강) 색 클래스를 쓰지 않는다', () => {
    render(<DealResultHeader tone="neutral" title="이번엔 선정되지 않았어요" subtitle="다음 기회에" />);
    const h = screen.getByRole('heading', { name: /이번엔 선정되지 않았어요/ });
    expect(h.className).not.toContain('--md-sys-color-tertiary');
    expect(h.className).not.toContain('--md-sys-color-error');
    expect(screen.getByText('다음 기회에')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/deal-room/__tests__/DealResultHeader.test.tsx`
Expected: FAIL — `Cannot find module '../DealResultHeader'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/deal-room/DealResultHeader.tsx
import type { ReactNode } from 'react';
import { CheckCircle2, Flag } from 'lucide-react';

export function DealResultHeader({
  tone,
  title,
  subtitle,
  children,
}: {
  tone: 'award' | 'neutral';
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  const award = tone === 'award';
  return (
    <section>
      <h3
        className={
          award
            ? 'flex items-center gap-2 text-[16px] font-bold text-[var(--md-sys-color-tertiary)]'
            : 'flex items-center gap-2 text-[15px] font-bold text-[var(--md-sys-color-on-surface)]'
        }
      >
        {award ? (
          <CheckCircle2 size={20} aria-hidden />
        ) : (
          <Flag size={19} className="text-[var(--md-sys-color-on-surface-variant)]" aria-hidden />
        )}
        {title}
      </h3>
      {subtitle && (
        <p className="mt-1.5 pl-7 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{subtitle}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/deal-room/__tests__/DealResultHeader.test.tsx`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add components/deal-room/DealResultHeader.tsx components/deal-room/__tests__/DealResultHeader.test.tsx
git commit -m "feat(deal-room): DealResultHeader — 선정/미선정 결과 헤더(award/neutral)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: pgRequestChip — 선정됨/선정 마감 칩 + 호출처 와이어링

**Files:**
- Modify: `lib/rfp-status.ts:26-33`
- Test: `lib/__tests__/rfp-status.test.ts` (추가)
- Modify: `app/(app)/inbox/[rfpId]/page.tsx:49-52`
- Modify: `app/(app)/inbox/@modal/(.)[rfpId]/page.tsx:42-45`

**Interfaces:**
- Produces: `pgRequestChip({ pendingRequote: boolean; hasBid: boolean; awarded?: boolean; awardedToMe?: boolean }): StatusChip`. 우선순위: awarded 가 재요청/제출보다 우선. `awarded && awardedToMe` → `{ '선정됨', 'tertiary' }`; `awarded && !awardedToMe` → `{ '선정 마감', 'surface' }`. 그 외 기존 로직 유지(인자 생략 시 동작 불변).

- [ ] **Step 1: Write the failing test (기존 describe('pgRequestChip') 안에 추가)**

```tsx
  it('선정됐고 본인 선정이면 선정됨 칩', () => {
    expect(pgRequestChip({ pendingRequote: false, hasBid: true, awarded: true, awardedToMe: true })).toEqual({
      label: '선정됨',
      color: 'tertiary',
    });
  });

  it('선정됐고 타사 선정이면 선정 마감 칩(중립)', () => {
    expect(pgRequestChip({ pendingRequote: false, hasBid: true, awarded: true, awardedToMe: false })).toEqual({
      label: '선정 마감',
      color: 'surface',
    });
  });

  it('선정 상태는 재요청/제출보다 우선한다', () => {
    expect(pgRequestChip({ pendingRequote: true, hasBid: true, awarded: true, awardedToMe: true })).toEqual({
      label: '선정됨',
      color: 'tertiary',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/__tests__/rfp-status.test.ts`
Expected: FAIL — 새 케이스가 기존 분기(재요청/견적 보냄)로 떨어져 라벨 불일치.

- [ ] **Step 3: Implement — `pgRequestChip` 본문 교체**

`lib/rfp-status.ts` 의 함수를 아래로 교체:

```ts
// PG 인박스/딜룸 요청 상태 칩 — 선정 종료 > 재요청 > 견적 보냄 > 신규 우선순위.
export function pgRequestChip(args: {
  pendingRequote: boolean;
  hasBid: boolean;
  awarded?: boolean;
  awardedToMe?: boolean;
}): StatusChip {
  if (args.awarded) {
    return args.awardedToMe
      ? { label: '선정됨', color: 'tertiary' }
      : { label: '선정 마감', color: 'surface' };
  }
  if (args.pendingRequote) return { label: '재요청', color: 'warning' };
  if (args.hasBid) return { label: '견적 보냄', color: 'tertiary' };
  return { label: '신규', color: 'warning' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/__tests__/rfp-status.test.ts`
Expected: PASS (기존 + 신규 모두 green).

- [ ] **Step 5: Wire callers — 두 페이지에서 awarded 정보 전달**

`app/(app)/inbox/[rfpId]/page.tsx` 의 `const chip = pgRequestChip({...})` 를:

```tsx
  const chip = pgRequestChip({
    pendingRequote: !!data.pendingRequote,
    hasBid: !!data.myBid,
    awarded: data.rfp.status === 'awarded',
    awardedToMe: data.awardedToMe,
  });
```

`app/(app)/inbox/@modal/(.)[rfpId]/page.tsx` 의 동일 블록도 같은 4-필드로 교체.

- [ ] **Step 6: Verify typecheck + commit**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음.

```bash
git add lib/rfp-status.ts lib/__tests__/rfp-status.test.ts "app/(app)/inbox/[rfpId]/page.tsx" "app/(app)/inbox/@modal/(.)[rfpId]/page.tsx"
git commit -m "feat(rfp-status): PG 칩에 선정됨/선정 마감 추가 + 인박스 딜룸 와이어링

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: PgDealRoomBody — 결과 통합형으로 재구성

**Files:**
- Modify: `components/deal-room/pg/PgDealRoomBody.tsx`
- Test: `components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx:117-147` (선정 결과 describe 갱신)

**Interfaces:**
- Consumes: `ContactBlock`(Task 2), `DealResultHeader`(Task 3), 기존 `SubmittedSummary`/`buildSubmittedSummaryRows`/`LocalTime`/`BidWizard`/`RequoteBanner`.
- 제거: 떠 있던 `CounterpartyContactCard`/`NotSelectedNotice` 블록과 그 import.

- [ ] **Step 1: 기존 테스트를 새 동작으로 교체(RED) — describe('PgDealRoomBody — 선정 결과 안내') 전체를 아래로 교체**

```tsx
describe('PgDealRoomBody — 선정 결과 안내', () => {
  const buyerContact = { workspaceName: '(주)테스트', name: '구매 담당자', email: 'buyer@buy.com', phone: null };

  it('awardedToMe 면 견적 작성 탭에 선정 결과 헤더 + 구매사 연락처를 보여준다', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      myBid: submittedBid,
      awardedToMe: true,
      buyerContact,
    })} />);
    expect(screen.getByText('이 견적이 선정됐어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /buyer@buy\.com/ })).toBeInTheDocument();
    // 보낸 내용은 계속 확인 가능.
    expect(screen.getByRole('button', { name: /보낸 내용 보기/ })).toBeInTheDocument();
  });

  it('타사 선정(awarded, awardedToMe=false)이면 미선정 결과 헤더 + 연락처 없음 + BidWizard 미노출', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      myBid: submittedBid,
      awardedToMe: false,
      buyerContact: null,
    })} />);
    expect(screen.getByText('이번엔 선정되지 않았어요')).toBeInTheDocument();
    expect(screen.queryByText('이 견적이 선정됐어요')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bid-wizard')).not.toBeInTheDocument();
  });

  it('선정 전(sent)에는 결과 헤더를 렌더하지 않는다', () => {
    render(<PgDealRoomBody data={buildData({ myBid: submittedBid })} />);
    expect(screen.queryByText('이 견적이 선정됐어요')).not.toBeInTheDocument();
    expect(screen.queryByText('이번엔 선정되지 않았어요')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx`
Expected: FAIL — 현재는 '구매사 담당자 연락처' 카드를 그리고 '이 견적이 선정됐어요' 텍스트가 없음.

- [ ] **Step 3: Implement — import 교체**

`components/deal-room/pg/PgDealRoomBody.tsx` 상단:
- `import { useState } from 'react';` → `import { useState, type ReactNode } from 'react';`
- 제거: `import { CounterpartyContactCard } from '@/components/deal-room/CounterpartyContactCard';`
- 제거: `import { NotSelectedNotice } from '@/components/deal-room/NotSelectedNotice';`
- 추가: `import { ContactBlock } from '@/components/deal-room/ContactBlock';`
- 추가: `import { DealResultHeader } from '@/components/deal-room/DealResultHeader';`

- [ ] **Step 4: Implement — `writeContent` 계산을 if/else 로 교체**

기존 `const writeContent = pendingRequote ? (...) : myBid ? (...) : (<BidWizard .../>);` 전체를 아래로 교체:

```tsx
  const isAwarded = rfp.status === 'awarded';
  let writeContent: ReactNode;
  if (pendingRequote) {
    writeContent = (
      <>
        <RequoteBanner message={pendingRequote.message} deadline={pendingRequote.deadline} />
        <BidWizard rfp={rfp} buyerName={buyerName} templates={quoteTemplates} initialBid={myBid} />
      </>
    );
  } else if (isAwarded && awardedToMe) {
    writeContent = (
      <div className="space-y-4">
        <DealResultHeader
          tone="award"
          title="이 견적이 선정됐어요"
          subtitle={myBid?.submittedAt ? <>보낸 시각 <LocalTime iso={myBid.submittedAt} /></> : undefined}
        >
          {buyerContact && <ContactBlock contact={buyerContact} counterpartyKind="buyer" />}
        </DealResultHeader>
        {myBid && <SubmittedSummary rows={buildSubmittedSummaryRows(rfp, myBid)} />}
      </div>
    );
  } else if (isAwarded && !awardedToMe) {
    writeContent = (
      <div className="space-y-4">
        <DealResultHeader
          tone="neutral"
          title="이번엔 선정되지 않았어요"
          subtitle="구매사가 다른 PG를 선정했어요. 보내주신 견적은 잘 전달됐고, 좋은 기회로 다시 만나요."
        />
        {myBid && <SubmittedSummary rows={buildSubmittedSummaryRows(rfp, myBid)} />}
      </div>
    );
  } else if (myBid) {
    writeContent = (
      <div className="space-y-4">
        <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-tertiary)]">
          ✓ 견적을 보냈어요
        </p>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          보낸 시각: {myBid.submittedAt ? <LocalTime iso={myBid.submittedAt} /> : '—'}
        </p>
        <SubmittedSummary rows={buildSubmittedSummaryRows(rfp, myBid)} />
      </div>
    );
  } else {
    writeContent = <BidWizard rfp={rfp} buyerName={buyerName} templates={quoteTemplates} />;
  }
```

- [ ] **Step 5: Implement — 떠 있던 상단 블록 제거**

`return (...)` 안에서 아래 두 블록을 **삭제**(샘플 배너 블록은 유지):

```tsx
      {awardedToMe && buyerContact && (
        <div className="shrink-0 px-6 pt-4">
          <CounterpartyContactCard title="구매사 담당자 연락처" contact={buyerContact} />
        </div>
      )}
      {rfp.status === 'awarded' && !awardedToMe && (
        <div className="shrink-0 px-6 pt-4">
          <NotSelectedNotice />
        </div>
      )}
```

- [ ] **Step 6: Run test + typecheck to verify pass**

Run: `pnpm test components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx`
Expected: PASS.
Run: `pnpm tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 7: Commit**

```bash
git add components/deal-room/pg/PgDealRoomBody.tsx components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx
git commit -m "feat(deal-room): PG 딜룸 선정/미선정 결과 통합형(연락처 견적 작성 탭 병합)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: BuyerDealRoomBody — 상단 결과 패널로 승격

**Files:**
- Modify: `components/deal-room/buyer/BuyerDealRoomBody.tsx`
- Test: `components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx:140-156`

**Interfaces:**
- Consumes: `ContactBlock`(Task 2), `DealResultHeader`(Task 3), `josa`(`es-hangul`), 기존 `awardedPgContact`.
- 제거: `CounterpartyContactCard` import 및 사용.

- [ ] **Step 1: 기존 테스트를 새 동작으로 교체(RED) — describe('BuyerDealRoomBody — 선정 PG 연락처') 전체 교체**

```tsx
describe('BuyerDealRoomBody — 선정 결과 패널', () => {
  const awardedPgContact = { workspaceName: '토스페이먼츠', name: '김영업', email: 'sales@toss.im', phone: '010-1234-5678' };

  it('awarded + awardedPgContact 면 "<PG>를 선정했어요" 결과 패널 + 연락처를 렌더한다', () => {
    render(<BuyerDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      awardedPgContact,
    })} />);
    expect(screen.getByText(/토스페이먼츠를 선정했어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sales@toss\.im/ })).toBeInTheDocument();
  });

  it('sent(선정 전)에는 결과 패널을 렌더하지 않는다', () => {
    render(<BuyerDealRoomBody data={buildData()} />);
    expect(screen.queryByText(/선정했어요/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx`
Expected: FAIL — 현재는 '선정한 PG 담당자 연락처' 라벨이고 '선정했어요' 텍스트 없음.

- [ ] **Step 3: Implement — import 교체**

`components/deal-room/buyer/BuyerDealRoomBody.tsx`:
- 제거: `import { CounterpartyContactCard } from '@/components/deal-room/CounterpartyContactCard';`
- 추가: `import { ContactBlock } from '@/components/deal-room/ContactBlock';`
- 추가: `import { DealResultHeader } from '@/components/deal-room/DealResultHeader';`
- 추가: `import { josa } from 'es-hangul';`

- [ ] **Step 4: Implement — 상단 블록 교체 (163-167행)**

```tsx
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
```

- [ ] **Step 5: Run test + typecheck to verify pass**

Run: `pnpm test components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx`
Expected: PASS.
Run: `pnpm tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add components/deal-room/buyer/BuyerDealRoomBody.tsx components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx
git commit -m "feat(deal-room): 구매사 딜룸 선정 결과 패널(연락처 통합)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 구 컴포넌트 제거 (CounterpartyContactCard · NotSelectedNotice)

**Files:**
- Delete: `components/deal-room/CounterpartyContactCard.tsx`
- Delete: `components/deal-room/__tests__/CounterpartyContactCard.test.tsx`
- Delete: `components/deal-room/NotSelectedNotice.tsx`
- (NotSelectedNotice 전용 테스트 파일이 있으면 함께 삭제 — `git grep` 으로 확인)

**Interfaces:** 없음(소비처는 Task 5·6 에서 제거됨).

- [ ] **Step 1: 잔존 참조 확인**

Run: `git grep -n "CounterpartyContactCard\|NotSelectedNotice" -- '*.ts' '*.tsx'`
Expected: 결과 없음(소비처·테스트 모두 마이그레이션 완료). 결과가 있으면 그 파일을 먼저 정리.

- [ ] **Step 2: 파일 삭제**

```bash
git rm components/deal-room/CounterpartyContactCard.tsx \
       components/deal-room/__tests__/CounterpartyContactCard.test.tsx \
       components/deal-room/NotSelectedNotice.tsx
# NotSelectedNotice 전용 테스트가 있으면 함께:
# git rm components/deal-room/__tests__/NotSelectedNotice.test.tsx
```

- [ ] **Step 3: 전체 타입체크 + 관련 테스트 green 확인**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음.
Run: `pnpm test components/deal-room`
Expected: deal-room 전체 PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(deal-room): 구 CounterpartyContactCard·NotSelectedNotice 제거

ContactBlock + DealResultHeader 로 대체 완료.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 문서 — SCREEN_DESIGN.md 갱신

**Files:**
- Modify: `SCREEN_DESIGN.md:92` (B4, 구매사), `:103` (P3, PG)

**Interfaces:** 없음(문서 전용 — TDD 면제).

- [ ] **Step 1: B4 행(라인 92) "선정 종료 후" 문장 교체**

기존: `**선정 종료 후**: RFP \`awarded\` 시 선정한 PG 담당자 연락처 카드(\`CounterpartyContactCard\`) — 회사명·이름·이메일(mailto)·전화(tel, 있을 때만).`
→ `**선정 종료 후(결과 통합형)**: RFP \`awarded\` 시 딜룸 상단 결과 패널 \`DealResultHeader\`(\`"<PG>를 선정했어요"\`, tertiary) + 선정 PG 담당자 \`ContactBlock\`(아바타·이름·상대칩·이메일/전화 + \`CopyButton\` 복사).`
그리고 같은 행 끝 컴포넌트 목록에서 `CounterpartyContactCard` 를 `DealResultHeader`, `ContactBlock`, `CopyButton` 로 교체.

- [ ] **Step 2: P3 행(라인 103) "선정 종료 후" 문장 교체**

기존: `**선정 종료 후**: \`awarded\` & 본인 선정 시 구매사 담당자 연락처 카드(\`CounterpartyContactCard\`); 타사 선정 시 미선정 안내(\`NotSelectedNotice\`, 연락처 없음).`
→ `**선정 종료 후(결과 통합형)**: \`견적 작성\` 탭의 제출 상태가 결과로 승격된다 — 본인 선정 시 \`DealResultHeader\`(award, \`"이 견적이 선정됐어요"\`) + 구매사 \`ContactBlock\`; 타사 선정 시 \`DealResultHeader\`(neutral, \`"이번엔 선정되지 않았어요"\`, 연락처 없음). 헤더 칩은 \`선정됨\`/\`선정 마감\`(\`pgRequestChip\`). 두 경우 모두 \`보낸 내용 보기\`(SubmittedSummary) 유지.`
그리고 같은 행 끝 컴포넌트 목록에서 `CounterpartyContactCard`, `NotSelectedNotice` 를 `DealResultHeader`, `ContactBlock`, `CopyButton` 로 교체.

- [ ] **Step 3: Commit**

```bash
git add SCREEN_DESIGN.md
git commit -m "docs(screen): 딜룸 선정 결과 통합형(DealResultHeader/ContactBlock) 반영

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 최종 검증

- [ ] 전체 스위트: `pnpm test` — 모두 green.
- [ ] 타입: `pnpm tsc --noEmit` — 0.
- [ ] 린트: `pnpm lint` — 0.
- [ ] (선택) 로컬 육안 확인: PG 선정/미선정, 구매사 선정 화면.

## Deferred / Optional (이번 범위 밖 — 의도적 제외)

- **구매사 결과 헤더의 "선정 {날짜}" 보조문구**: award 시각은 `contracts.awardedAt` 에만 있어(RFP 아님), 표시하려면 `loadBuyerRfpDetail` 에 `getContractRepo().findByRfp(rfp.id)` 1건 + `BuyerRfpDetailData.awardedAt: string | null` + `buildData` 기본값 + 계약 행을 만드는 로더 테스트가 필요하다. 스펙 §4 폴백에 따라 이번엔 생략(구매사 모멘트는 제목 + `선정 완료` 칩으로 충분). 추후 원하면 단독 태스크로 추가:
  - `lib/server/rfp-detail-loader.ts` (loadBuyerRfpDetail): `awarded` 면 `const contract = await (await getContractRepo()).findByRfp(rfp.id); awardedAt = contract?.awardedAt ?? null;`
  - `BuyerDealRoomBody`: `subtitle={awardedAt ? <>선정 <LocalTime iso={awardedAt} /></> : undefined}` (LocalTime import 추가)
- 미선정 PG '다른 견적 요청 둘러보기' CTA: 명시적 제외.
