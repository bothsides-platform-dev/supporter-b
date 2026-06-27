# 선정 후 담당자 연락처 교환 (deal-room contact card) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적이 `awarded` 되면 구매사와 선정된 PG 가 딜룸에서 서로의 담당자 연락처(이름·이메일·전화)를 보고 직접 연락할 수 있게 하고, 미선정 PG 에게는 연락처 없이 정중한 안내만 보여준다.

**Architecture:** 연락처 노출은 **서버 로더에서 게이트**한다 — `loadBuyerRfpDetail`/`loadPgRfpDetail` 가 `awarded` 상태일 때만, 정확한 당사자에게만 상대 담당자 연락처를 부착한다(봉인입찰 경계, fail-closed). 신규 유저 리포 read `findContactById` 가 `{name,email,phone}` 를 가져오고, 표현은 순수 컴포넌트 `CounterpartyContactCard`/`NotSelectedNotice` 가 담당한다. DDL·신규 라우트·이메일 변경 없음.

**Tech Stack:** Next.js App Router, Drizzle ORM + Postgres(단위테스트는 PGlite), Vitest + @testing-library/react, Tailwind v4 + CSS 변수 토큰, lucide-react.

## Global Constraints

- **TDD 필수** — 모든 신규 코드는 RED → GREEN → REFACTOR. 실패하는 테스트를 먼저 보고 구현한다.
- **리포지토리 경계** — DB 접근은 `lib/server/repositories/**` 안에서만. `lib/db/schema`·`lib/db/client` 를 그 밖에서 값(value)으로 import 금지. 로더는 `get*Repo()` 주입만 사용한다.
- **봉인입찰 경계** — 상대 당사자의 email/phone 은 `awarded` 전에는 RSC 페이로드에 절대 실리지 않는다. 미선정 PG 페이로드에 구매사 연락처가 있으면 안 된다(회귀 테스트로 고정).
- **Linear 디자인** — pill 금지(6px radius), 큰 그림자 금지(1px `outline-variant` 보더), body ≥16px 금지(13–14px), 숫자는 `.md-numeric`(전화번호). 토큰은 `var(--md-sys-color-*)` 인라인 사용(기존 딜룸 컨벤션).
- **UX 라이팅** — 사용자 문구는 해요체·긍정형(`UX_WRITING.md`). 도메인 용어: 화면은 '견적/선정', 코드는 `rfp/bid` 유지.
- **연락처 = 개인 담당자** — 구매사 `rfps.createdBy`, PG = 선정된 bid 의 `submittedBy`. 워크스페이스 단위 연락처 없음.
- **전화 표시 규칙** — 이메일은 항상, 전화(`users.phone`, nullable)는 값이 있을 때만 행을 렌더한다. null 이면 "미등록" 같은 표기 없이 생략.

---

## File Structure

- `lib/server/repositories/types.ts` — `UserRepo` 인터페이스에 `findContactById` 추가.
- `lib/server/repositories/drizzle/user.ts` — `findContactById` 구현(`findProfileById` 미러, phone select, 시스템 계정 제외).
- `lib/server/repositories/drizzle/__tests__/_seed.ts` — `seedUser` 에 `phone?` override 추가(공유 헬퍼).
- `lib/server/repositories/drizzle/__tests__/user.test.ts` — `findContactById` 리포 테스트.
- `lib/server/rfp-detail-loader.ts` — `DealContact` 타입 export + 두 로더에 `awardedPgContact`/`buyerContact` 부착 + `getUserRepo` import.
- `lib/server/__tests__/rfp-detail-loader.test.ts` — 로더 연락처/경계 테스트.
- `components/deal-room/CounterpartyContactCard.tsx` (신규) — 표현 컴포넌트.
- `components/deal-room/__tests__/CounterpartyContactCard.test.tsx` (신규) — 컴포넌트 테스트.
- `components/deal-room/NotSelectedNotice.tsx` (신규) — 미선정 안내 컴포넌트.
- `components/deal-room/__tests__/NotSelectedNotice.test.tsx` (신규) — 컴포넌트 테스트.
- `components/deal-room/pg/PgDealRoomBody.tsx` + `components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx` — PG 와이어링 + 테스트.
- `components/deal-room/buyer/BuyerDealRoomBody.tsx` + `components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx` — 구매사 와이어링 + 테스트.
- `SCREEN_DESIGN.md` — rfp/inbox 딜룸에 신규 카드/안내 등록.

---

## Task 1: `findContactById` 유저 리포 read

연락처(`name`·`email`·`phone`)를 id 로 가져오는 전용 read. `findProfileById` 패턴(시스템 계정 제외, fail-closed)을 따른다.

**Files:**
- Modify: `lib/server/repositories/types.ts:496` (UserRepo 인터페이스, `findProfileById` 바로 뒤)
- Modify: `lib/server/repositories/drizzle/user.ts:118` (`findProfileById` 구현 바로 뒤)
- Modify: `lib/server/repositories/drizzle/__tests__/_seed.ts:14` (`seedUser` override 에 `phone?`)
- Test: `lib/server/repositories/drizzle/__tests__/user.test.ts` (신규 describe 블록 append)

**Interfaces:**
- Produces: `UserRepo.findContactById(userId: string, tx?: Tx): Promise<{ name: string; email: string; phone: string | null } | undefined>`
- Produces: `seedUser(db, { ..., phone?: string })` — 시드에 phone 주입 가능.

- [ ] **Step 1: `seedUser` 에 phone override 추가**

`lib/server/repositories/drizzle/__tests__/_seed.ts` 의 `seedUser` 를 아래로 교체:

```ts
export async function seedUser(
  db: PgliteDB,
  overrides?: { id?: string; email?: string; name?: string; isSystemAccount?: boolean; phone?: string },
): Promise<{ id: string; email: string; name: string }> {
  const id = overrides?.id ?? randomUUID();
  const email = overrides?.email ?? `u-${id.slice(0, 8)}@example.com`;
  const name = overrides?.name ?? 'Tester';
  await db.insert(users).values({
    id,
    email,
    passwordHash: 'x',
    name,
    avatarColor: 'ink',
    ...(overrides?.isSystemAccount ? { isSystemAccount: true } : {}),
    ...(overrides?.phone ? { phone: overrides.phone } : {}),
  });
  return { id, email, name };
}
```

- [ ] **Step 2: 실패 테스트 작성**

`lib/server/repositories/drizzle/__tests__/user.test.ts` 끝에 append:

```ts
describe('findContactById', () => {
  it('returns name/email/phone for a normal user', async () => {
    const { db, repo } = await setup();
    const u = await seedUser(db, { email: 'sales@toss.im', name: '김영업', phone: '010-1234-5678' });

    const contact = await repo.findContactById(u.id);

    expect(contact).toEqual({ name: '김영업', email: 'sales@toss.im', phone: '010-1234-5678' });
  });

  it('returns phone=null when the user has no phone', async () => {
    const { db, repo } = await setup();
    const u = await seedUser(db, { email: 'nophone@x.com', name: '담당자' });

    const contact = await repo.findContactById(u.id);

    expect(contact).toEqual({ name: '담당자', email: 'nophone@x.com', phone: null });
  });

  it('returns undefined for a system account (hidden from member surfaces)', async () => {
    const { db, repo } = await setup();
    const u = await seedUser(db, { email: 'master@ops.com', name: 'Ops', isSystemAccount: true });

    expect(await repo.findContactById(u.id)).toBeUndefined();
  });

  it('returns undefined for an unknown id', async () => {
    const { repo } = await setup();
    expect(await repo.findContactById(randomUUID())).toBeUndefined();
  });
});
```

- [ ] **Step 3: 테스트 RED 확인**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/user.test.ts`
Expected: FAIL — `repo.findContactById is not a function`.

- [ ] **Step 4: 인터페이스에 시그니처 추가**

`lib/server/repositories/types.ts` 의 `findProfileById(...)` 선언(496–501행) 바로 뒤에 삽입:

```ts
  /**
   * 연락처 projection — id 매칭 **+ 시스템 계정 제외**(findProfileById 와 동일 fail-closed).
   * 선정 후 담당자 연락처 교환용. 시스템 계정이거나 행이 없으면 undefined. phone 은 nullable.
   */
  findContactById(
    userId: string,
    tx?: Tx,
  ): Promise<{ name: string; email: string; phone: string | null } | undefined>;
```

- [ ] **Step 5: 구현 추가**

`lib/server/repositories/drizzle/user.ts` 의 `findProfileById` 메서드(92–118행) 바로 뒤에 삽입:

```ts
  async findContactById(
    userId: string,
    tx?: Tx,
  ): Promise<{ name: string; email: string; phone: string | null } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isSystemAccount, false)))
      .limit(1);
    if (!row) return undefined;
    return { name: row.name, email: row.email, phone: row.phone ?? null };
  }
```

(`and`·`eq`·`users` 는 이미 import 되어 있다.)

- [ ] **Step 6: 테스트 GREEN 확인**

Run: `pnpm test lib/server/repositories/drizzle/__tests__/user.test.ts`
Expected: PASS (4 신규 + 기존 모두 green).

- [ ] **Step 7: 커밋**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/user.ts lib/server/repositories/drizzle/__tests__/_seed.ts lib/server/repositories/drizzle/__tests__/user.test.ts
git commit -m "feat(repo): findContactById — 담당자 연락처(name/email/phone) read"
```

---

## Task 2: 로더에 연락처 부착 (`awardedPgContact` / `buyerContact`)

`awarded` 일 때만 상대 담당자 연락처를 부착한다. 미선정 PG 에게는 절대 부착하지 않는다(봉인입찰 경계 회귀 테스트 포함).

**Files:**
- Modify: `lib/server/rfp-detail-loader.ts` (import 7–16행, `BuyerRfpDetailData` 25–42행, `PgRfpDetailData` 44–59행, buyer 로더 return 230–243행, pg 로더 278–323행)
- Test: `lib/server/__tests__/rfp-detail-loader.test.ts` (신규 describe append + `setup()` return 에 `pgUserId` 추가 + 스키마 import 에 `users` 추가)

**Interfaces:**
- Consumes: `getUserRepo().findContactById(userId)` (Task 1).
- Produces: `export type DealContact = { workspaceName: string; name: string; email: string; phone: string | null }`
- Produces: `BuyerRfpDetailData.awardedPgContact: DealContact | null`
- Produces: `PgRfpDetailData.buyerContact: DealContact | null`

- [ ] **Step 1: 실패 테스트 작성**

테스트는 기존 모듈 레벨 `ctx`(beforeEach 에서 `setup()` 으로 채워짐)를 그대로 쓴다. 두 가지 준비가 필요하다.

(a) `setup()` 의 `return` 객체(현재 `db`/`buyerWsId`/`otherWsId`/`tossId`/`inicisId`/`buyerId`/`buyerName`/`seedRfp`/`seedInvitation`/`seedBid`/`seedNote`/`seedPgRequest` 노출)에 PG 담당자 id 한 줄을 추가한다 — `pgUserId: pgUser.id,` (테스트 전용, 부작용 없음).

(b) 파일 상단 스키마 import(9행)에 `users` 를 추가한다:

```ts
import { bids, bidNotes, columns, rfpAllowedPg, rfpInvitations, rfpPgRequests, rfpRequoteRequests, rfps, users } from '@/lib/db/schema';
```

그리고 시나리오 시딩 헬퍼 하나를 `setup()` 아래·`describe` 위에 추가한다(승자=toss, 패자=inicis):

```ts
// 선정 시나리오: 승자 PG=toss, 패자 PG=inicis. PG 담당자(pgUser)에 이름·전화를 부여하고
// 구매사 담당자(buyer)는 전화 없음(기본). opts.awarded 면 rfp 를 awarded 로 전이한다.
async function seedAwardScenario(opts: { awarded: boolean }): Promise<{ code: string }> {
  await ctx.db
    .update(users)
    .set({ name: '토스 담당자', phone: '010-9999-0000' })
    .where(eq(users.id, ctx.pgUserId));

  const rfpId = await ctx.seedRfp('AWARD-1');
  const winnerInv = await ctx.seedInvitation(rfpId, ctx.tossId, 'accepted');
  const winnerBid = await ctx.seedBid(rfpId, ctx.tossId, winnerInv, 'submitted');
  const loserInv = await ctx.seedInvitation(rfpId, ctx.inicisId, 'accepted');
  await ctx.seedBid(rfpId, ctx.inicisId, loserInv, 'submitted');

  if (opts.awarded) {
    await ctx.db
      .update(rfps)
      .set({ status: 'awarded', awardedBidId: winnerBid })
      .where(eq(rfps.id, rfpId));
  }
  return { code: 'AWARD-1' };
}
```

그리고 신규 describe 블록을 append 한다(구매사 담당자 `buyer` 의 이름은 `setup()` 시드 기준 '구매 담당자', 이메일 `buyer@buy.com`, 전화 없음 → null):

```ts
describe('연락처 교환 (awarded)', () => {
  it('구매사 로더: awarded 면 선정 PG 담당자 연락처를 부착한다', async () => {
    const { code } = await seedAwardScenario({ awarded: true });
    const data = await loadBuyerRfpDetail({
      code,
      workspaceId: ctx.buyerWsId,
      userId: ctx.buyerId,
      userName: ctx.buyerName,
    });
    expect(data?.awardedPgContact).toEqual({
      workspaceName: 'toss.im',
      name: '토스 담당자',
      email: 'pg@toss.im',
      phone: '010-9999-0000',
    });
  });

  it('구매사 로더: sent(미선정) 면 awardedPgContact 가 null', async () => {
    const { code } = await seedAwardScenario({ awarded: false });
    const data = await loadBuyerRfpDetail({
      code,
      workspaceId: ctx.buyerWsId,
      userId: ctx.buyerId,
      userName: ctx.buyerName,
    });
    expect(data?.awardedPgContact).toBeNull();
  });

  it('PG 로더: awardedToMe(승자=toss) 면 구매사 담당자 연락처를 부착한다', async () => {
    const { code } = await seedAwardScenario({ awarded: true });
    const data = await loadPgRfpDetail({ code, workspaceId: ctx.tossId });
    expect(data?.awardedToMe).toBe(true);
    expect(data?.buyerContact).toEqual({
      workspaceName: '구매사',
      name: '구매 담당자',
      email: 'buyer@buy.com',
      phone: null,
    });
  });

  it('PG 로더(경계): 미선정 PG(inicis) 페이로드엔 구매사 연락처가 없다', async () => {
    const { code } = await seedAwardScenario({ awarded: true });
    const data = await loadPgRfpDetail({ code, workspaceId: ctx.inicisId });
    expect(data?.awardedToMe).toBe(false);
    expect(data?.buyerContact).toBeNull();
    // 누출 회귀: 직렬화 페이로드 어디에도 구매사 이메일/전화가 없어야 한다.
    expect(JSON.stringify(data)).not.toContain('buyer@buy.com');
    expect(JSON.stringify(data)).not.toContain('010-');
  });
});
```

- [ ] **Step 2: 테스트 RED 확인**

Run: `pnpm test lib/server/__tests__/rfp-detail-loader.test.ts`
Expected: FAIL — `awardedPgContact`/`buyerContact` 가 `undefined`(타입·런타임 모두).

- [ ] **Step 3: `DealContact` 타입 + 로더 필드 타입 추가**

`lib/server/rfp-detail-loader.ts` 의 import 블록(7–16행)에 `getUserRepo` 추가:

```ts
import {
  getAttachmentRepo,
  getBidQuoteTemplateRepo,
  getBidRepo,
  getInvitationRepo,
  getPgRequestRepo,
  getRfpRepo,
  getUserRepo,
  getWorkspaceRepo,
  getRfpRequoteRequestRepo,
} from './repositories/factory';
```

`BuyerRfpDetailData` 정의(25행) 바로 위에 `DealContact` 를 추가:

```ts
/** 선정 후 교환되는 담당자 연락처 — 회사명 + 개인 이름·이메일·전화(nullable). */
export type DealContact = {
  workspaceName: string;
  name: string;
  email: string;
  phone: string | null;
};
```

`BuyerRfpDetailData` 의 `authorName: string;` 뒤에 추가:

```ts
  /** awarded 일 때만 — 선정된 PG 담당자 연락처. 그 외 상태는 null. */
  awardedPgContact: DealContact | null;
```

`PgRfpDetailData` 의 `awardedToMe: boolean;` 뒤에 추가:

```ts
  /** awardedToMe 일 때만 — 구매사 담당자 연락처. 미선정/선정 전은 null(누출 방지). */
  buyerContact: DealContact | null;
```

- [ ] **Step 4: buyer 로더 구현**

`loadBuyerRfpDetail` 의 `const canEdit = ...`(228행) 바로 위에 삽입:

```ts
  // 선정 완료 시에만 선정 PG 담당자 연락처를 부착(연락처 교환). 그 외 상태는 null.
  let awardedPgContact: DealContact | null = null;
  if (rfp.status === 'awarded' && rfp.awardedBidId) {
    const awardedBid = allBids.find((b) => b.id === rfp.awardedBidId);
    if (awardedBid) {
      const contact = await (await getUserRepo()).findContactById(awardedBid.submittedBy);
      if (contact) {
        awardedPgContact = { workspaceName: pgWsNameMap[awardedBid.pgWsId] ?? '—', ...contact };
      }
    }
  }
```

그리고 `return { ... }`(230–243행)의 객체 끝(`authorName: args.userName,` 뒤)에 추가:

```ts
    awardedPgContact,
```

- [ ] **Step 5: pg 로더 구현**

`loadPgRfpDetail` 에서 `stripBuyerOnlyFromPg(rfp)` 직전(279–281행, `awardedBidIdBeforeStrip` 캡처 옆)에 `createdBy` 를 캡처한다:

```ts
  const awardedBidIdBeforeStrip = rfp.awardedBidId;
  const createdByBeforeStrip = rfp.createdBy;
```

(이미 있는 `awardedBidIdBeforeStrip` 줄은 그대로 두고 `createdByBeforeStrip` 한 줄만 추가.)

`const buyerName = buyerWs?.name ?? '—';`(308행) 바로 뒤에 삽입:

```ts
  // awardedToMe 일 때만 구매사 담당자 연락처 부착. 미선정/선정 전은 조회조차 안 함(누출 방지).
  let buyerContact: DealContact | null = null;
  if (awardedToMe && createdByBeforeStrip) {
    const contact = await (await getUserRepo()).findContactById(createdByBeforeStrip);
    if (contact) buyerContact = { workspaceName: buyerName, ...contact };
  }
```

마지막 `return { rfp, myBid, pendingRequote, buyerName, quoteTemplates, awardedToMe };`(323행)를 교체:

```ts
  return { rfp, myBid, pendingRequote, buyerName, quoteTemplates, awardedToMe, buyerContact };
```

- [ ] **Step 6: 테스트 GREEN 확인**

Run: `pnpm test lib/server/__tests__/rfp-detail-loader.test.ts`
Expected: PASS (신규 4 + 기존 모두 green).

- [ ] **Step 7: 커밋**

```bash
git add lib/server/rfp-detail-loader.ts lib/server/__tests__/rfp-detail-loader.test.ts
git commit -m "feat(loader): awarded 시 담당자 연락처 부착 (구매사↔선정PG, 미선정 누출 차단)"
```

---

## Task 3: `CounterpartyContactCard` 표현 컴포넌트

연락처 카드 — 회사명·이름·이메일(mailto)·전화(tel, 있을 때만).

**Files:**
- Create: `components/deal-room/CounterpartyContactCard.tsx`
- Test: `components/deal-room/__tests__/CounterpartyContactCard.test.tsx`

**Interfaces:**
- Consumes: `type { DealContact }` from `@/lib/server/rfp-detail-loader` (Task 2).
- Produces: `<CounterpartyContactCard title={string} contact={DealContact} />`

- [ ] **Step 1: 실패 테스트 작성**

`components/deal-room/__tests__/CounterpartyContactCard.test.tsx`:

```tsx
import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CounterpartyContactCard } from '../CounterpartyContactCard';

afterEach(cleanup);

const withPhone = { workspaceName: '토스페이먼츠', name: '김영업', email: 'sales@toss.im', phone: '010-1234-5678' };

describe('CounterpartyContactCard', () => {
  it('제목·회사명·이름·이메일(mailto)을 렌더한다', () => {
    render(<CounterpartyContactCard title="선정한 PG 담당자 연락처" contact={withPhone} />);
    expect(screen.getByText('선정한 PG 담당자 연락처')).toBeInTheDocument();
    expect(screen.getByText('토스페이먼츠')).toBeInTheDocument();
    expect(screen.getByText('김영업')).toBeInTheDocument();
    const mail = screen.getByRole('link', { name: /sales@toss\.im/ });
    expect(mail).toHaveAttribute('href', 'mailto:sales@toss.im');
  });

  it('전화가 있으면 tel 링크를 렌더한다', () => {
    render(<CounterpartyContactCard title="t" contact={withPhone} />);
    const tel = screen.getByRole('link', { name: /010-1234-5678/ });
    expect(tel).toHaveAttribute('href', 'tel:010-1234-5678');
  });

  it('전화가 null 이면 tel 링크를 렌더하지 않는다', () => {
    render(<CounterpartyContactCard title="t" contact={{ ...withPhone, phone: null }} />);
    expect(screen.queryByRole('link', { name: /010-1234-5678/ })).not.toBeInTheDocument();
    // 이메일은 여전히 노출.
    expect(screen.getByRole('link', { name: /sales@toss\.im/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 RED 확인**

Run: `pnpm test components/deal-room/__tests__/CounterpartyContactCard.test.tsx`
Expected: FAIL — 모듈 `../CounterpartyContactCard` 없음.

- [ ] **Step 3: 컴포넌트 구현**

`components/deal-room/CounterpartyContactCard.tsx`:

```tsx
import { Mail, Phone } from 'lucide-react';
import type { DealContact } from '@/lib/server/rfp-detail-loader';

/**
 * 선정 후 딜룸에 노출되는 상대 담당자 연락처 카드. 이메일은 항상, 전화는 값이
 * 있을 때만 행을 렌더한다(현재 카드 수수료처럼 노출은 서버 로더가 게이트).
 */
export function CounterpartyContactCard({
  title,
  contact,
}: {
  title: string;
  contact: DealContact;
}) {
  return (
    <section className="rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-4">
      <h3 className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">{title}</h3>
      <p className="mt-1 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        {contact.workspaceName}
      </p>
      <p className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">{contact.name}</p>
      <div className="mt-2 space-y-1">
        <a
          href={`mailto:${contact.email}`}
          className="flex w-fit items-center gap-2 text-[13px] text-[var(--md-sys-color-primary)] hover:underline"
        >
          <Mail size={14} aria-hidden />
          <span>{contact.email}</span>
        </a>
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="flex w-fit items-center gap-2 text-[13px] text-[var(--md-sys-color-primary)] hover:underline"
          >
            <Phone size={14} aria-hidden />
            <span className="md-numeric">{contact.phone}</span>
          </a>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 GREEN 확인**

Run: `pnpm test components/deal-room/__tests__/CounterpartyContactCard.test.tsx`
Expected: PASS (3 green).

- [ ] **Step 5: 커밋**

```bash
git add components/deal-room/CounterpartyContactCard.tsx components/deal-room/__tests__/CounterpartyContactCard.test.tsx
git commit -m "feat(deal-room): CounterpartyContactCard — 담당자 연락처 카드"
```

---

## Task 4: `NotSelectedNotice` 미선정 안내 컴포넌트

연락처 없는 정중한 미선정 안내. 해요체.

**Files:**
- Create: `components/deal-room/NotSelectedNotice.tsx`
- Test: `components/deal-room/__tests__/NotSelectedNotice.test.tsx`

**Interfaces:**
- Produces: `<NotSelectedNotice />`

- [ ] **Step 1: 실패 테스트 작성**

`components/deal-room/__tests__/NotSelectedNotice.test.tsx`:

```tsx
import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NotSelectedNotice } from '../NotSelectedNotice';

afterEach(cleanup);

describe('NotSelectedNotice', () => {
  it('미선정 안내 문구를 렌더한다', () => {
    render(<NotSelectedNotice />);
    expect(screen.getByText('이번엔 선정되지 않았어요')).toBeInTheDocument();
  });

  it('연락처(이메일/전화 링크)를 노출하지 않는다', () => {
    const { container } = render(<NotSelectedNotice />);
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 RED 확인**

Run: `pnpm test components/deal-room/__tests__/NotSelectedNotice.test.tsx`
Expected: FAIL — 모듈 `../NotSelectedNotice` 없음.

- [ ] **Step 3: 컴포넌트 구현**

`components/deal-room/NotSelectedNotice.tsx`:

```tsx
/**
 * 미선정 PG 에게 보여주는 안내(연락처 없음). 연락처 교환은 선정 PG↔구매사만.
 */
export function NotSelectedNotice() {
  return (
    <section className="rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-4">
      <h3 className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
        이번엔 선정되지 않았어요
      </h3>
      <p className="mt-1 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        구매사가 다른 PG를 선정했어요. 좋은 기회로 다시 만나요.
      </p>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 GREEN 확인**

Run: `pnpm test components/deal-room/__tests__/NotSelectedNotice.test.tsx`
Expected: PASS (2 green).

- [ ] **Step 5: 커밋**

```bash
git add components/deal-room/NotSelectedNotice.tsx components/deal-room/__tests__/NotSelectedNotice.test.tsx
git commit -m "feat(deal-room): NotSelectedNotice — 미선정 안내"
```

---

## Task 5: PG 딜룸 와이어링

선정 시 구매사 연락처 카드, 타사 선정 시 미선정 안내를 PG 딜룸 상단에 렌더.

**Files:**
- Modify: `components/deal-room/pg/PgDealRoomBody.tsx` (import, destructure 29행, return 상단 74–80행)
- Test: `components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx` (`buildData` 기본값 + 신규 describe)

**Interfaces:**
- Consumes: `PgRfpDetailData.buyerContact` / `.awardedToMe` (Task 2), `CounterpartyContactCard` (Task 3), `NotSelectedNotice` (Task 4).

- [ ] **Step 1: 실패 테스트 작성 (+ 기존 fixture 업데이트)**

`components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx` 의 `buildData` 기본값에 `buyerContact: null` 을 추가한다(타입 충족):

```ts
function buildData(over?: Partial<PgRfpDetailData>): PgRfpDetailData {
  return {
    rfp: baseRfp,
    myBid: undefined,
    buyerName: '(주)테스트',
    quoteTemplates: [],
    pendingRequote: null,
    awardedToMe: false,
    buyerContact: null,
    ...over,
  };
}
```

파일 끝에 append:

```tsx
describe('PgDealRoomBody — 선정 결과 안내', () => {
  const buyerContact = { workspaceName: '(주)테스트', name: '구매 담당자', email: 'buyer@buy.com', phone: null };

  it('awardedToMe 면 구매사 담당자 연락처 카드를 렌더한다', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      myBid: submittedBid,
      awardedToMe: true,
      buyerContact,
    })} />);
    expect(screen.getByText('구매사 담당자 연락처')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /buyer@buy\.com/ })).toBeInTheDocument();
  });

  it('타사 선정(awarded, awardedToMe=false)이면 미선정 안내를 렌더한다', () => {
    render(<PgDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      myBid: submittedBid,
      awardedToMe: false,
      buyerContact: null,
    })} />);
    expect(screen.getByText('이번엔 선정되지 않았어요')).toBeInTheDocument();
    expect(screen.queryByText('구매사 담당자 연락처')).not.toBeInTheDocument();
  });

  it('선정 전(sent)에는 어떤 안내도 렌더하지 않는다', () => {
    render(<PgDealRoomBody data={buildData({ myBid: submittedBid })} />);
    expect(screen.queryByText('구매사 담당자 연락처')).not.toBeInTheDocument();
    expect(screen.queryByText('이번엔 선정되지 않았어요')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 RED 확인**

Run: `pnpm test components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx`
Expected: FAIL — 카드/안내 텍스트가 문서에 없음.

- [ ] **Step 3: 와이어링 구현**

`components/deal-room/pg/PgDealRoomBody.tsx` 상단 import 에 추가:

```tsx
import { CounterpartyContactCard } from '@/components/deal-room/CounterpartyContactCard';
import { NotSelectedNotice } from '@/components/deal-room/NotSelectedNotice';
```

destructure(29행)를 교체:

```tsx
  const { rfp, myBid, buyerName, quoteTemplates, pendingRequote, awardedToMe, buyerContact } = data;
```

return 의 `{rfp.isSample && (...)}` 블록(76–80행) 바로 뒤에 삽입:

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

- [ ] **Step 4: 테스트 GREEN 확인**

Run: `pnpm test components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx`
Expected: PASS (신규 3 + 기존 모두 green).

- [ ] **Step 5: 커밋**

```bash
git add components/deal-room/pg/PgDealRoomBody.tsx components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx
git commit -m "feat(deal-room): PG 딜룸 — 선정 시 구매사 연락처, 미선정 안내"
```

---

## Task 6: 구매사 딜룸 와이어링

선정 시 선정 PG 담당자 연락처 카드를 구매사 딜룸 상단에 렌더.

**Files:**
- Modify: `components/deal-room/buyer/BuyerDealRoomBody.tsx` (import, destructure 44–53행, return 상단 156–160행)
- Test: `components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx` (`buildData`/fixture 기본값 + 신규 describe)

**Interfaces:**
- Consumes: `BuyerRfpDetailData.awardedPgContact` (Task 2), `CounterpartyContactCard` (Task 3).

- [ ] **Step 1: 기존 테스트 fixture 확인 + 실패 테스트 작성**

먼저 `components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx` 의 데이터 빌더 `buildData`(97–113행) 기본 객체에 `awardedPgContact: null` 을 추가한다(`requoteByPg: {},` 줄 옆, `BuyerRfpDetailData` 타입 충족). 이 파일은 `render` 를 `DealRoomProvider` 로 감싸고 무거운 자식(`FocusComparison` 등)을 이미 mock 한다 — `baseRfp` 픽스처도 정의돼 있다.

파일 끝에 append:

```tsx
describe('BuyerDealRoomBody — 선정 PG 연락처', () => {
  const awardedPgContact = { workspaceName: '토스페이먼츠', name: '김영업', email: 'sales@toss.im', phone: '010-1234-5678' };

  it('awarded + awardedPgContact 면 선정 PG 담당자 연락처 카드를 렌더한다', () => {
    render(<BuyerDealRoomBody data={buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      awardedPgContact,
    })} />);
    expect(screen.getByText('선정한 PG 담당자 연락처')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sales@toss\.im/ })).toBeInTheDocument();
  });

  it('sent(선정 전)에는 연락처 카드를 렌더하지 않는다', () => {
    render(<BuyerDealRoomBody data={buildData()} />);
    expect(screen.queryByText('선정한 PG 담당자 연락처')).not.toBeInTheDocument();
  });
});
```

> 해당 테스트 파일이 child(`FocusComparison`·`RfpInviteManager`·`useDealRoom` 등)를 mock 하는 패턴은 PgDealRoomBody.test.tsx 와 동일하다 — 이미 그 파일에 셋업돼 있다. 신규 텍스트만 추가 검증하므로 추가 mock 불필요.

- [ ] **Step 2: 테스트 RED 확인**

Run: `pnpm test components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx`
Expected: FAIL — '선정한 PG 담당자 연락처' 가 문서에 없음.

- [ ] **Step 3: 와이어링 구현**

`components/deal-room/buyer/BuyerDealRoomBody.tsx` 상단 import 에 추가:

```tsx
import { CounterpartyContactCard } from '@/components/deal-room/CounterpartyContactCard';
```

destructure(44–53행)에 `awardedPgContact` 를 추가:

```tsx
  const {
    rfp,
    bids,
    rfpFiles,
    pgWsNameMap,
    inviteList,
    pendingRequests,
    canEdit,
    requoteByPg,
    awardedPgContact,
  } = data;
```

return 의 `{rfp.isSample && (...)}` 블록(156–160행) 바로 뒤에 삽입:

```tsx
      {rfp.status === 'awarded' && awardedPgContact && (
        <div className="shrink-0 px-6 pt-4">
          <CounterpartyContactCard title="선정한 PG 담당자 연락처" contact={awardedPgContact} />
        </div>
      )}
```

- [ ] **Step 4: 테스트 GREEN 확인**

Run: `pnpm test components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx`
Expected: PASS (신규 2 + 기존 모두 green).

- [ ] **Step 5: 커밋**

```bash
git add components/deal-room/buyer/BuyerDealRoomBody.tsx components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx
git commit -m "feat(deal-room): 구매사 딜룸 — 선정 PG 담당자 연락처 카드"
```

---

## Task 7: 문서 등록 + 전체 그린 검증

스크린 스펙에 신규 카드/안내를 등록하고 전체 스위트·타입·린트를 통과시킨다.

**Files:**
- Modify: `SCREEN_DESIGN.md` (rfp 딜룸 / inbox 딜룸 화면 스펙)

- [ ] **Step 1: SCREEN_DESIGN.md 업데이트**

`SCREEN_DESIGN.md` 에서 구매사 RFP 상세(`/rfp/[id]`) 및 PG 견적(`/inbox/[rfpId]`) 딜룸 화면 항목을 찾아, 선정 종결 후 동작을 한 줄씩 추가한다(기존 표/스펙 포맷에 맞춰):

- 구매사 딜룸: "RFP `awarded` 시 상단에 선정한 PG 담당자 연락처 카드(`CounterpartyContactCard`) 노출 — 회사명·이름·이메일(mailto)·전화(tel, 있을 때만)."
- PG 딜룸: "RFP `awarded` & 본인 선정 시 구매사 담당자 연락처 카드; 타사 선정 시 미선정 안내(`NotSelectedNotice`, 연락처 없음)."

- [ ] **Step 2: 전체 테스트 그린 확인**

Run: `pnpm test`
Expected: PASS — 전체 스위트 green(신규 테스트 포함). 실패 시 해당 파일 단독 재실행으로 격리(플레이크는 메모리 참조).

- [ ] **Step 3: 타입·린트 확인**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: 둘 다 0 에러.

- [ ] **Step 4: 커밋**

```bash
git add SCREEN_DESIGN.md
git commit -m "docs(screen): 딜룸 선정 후 담당자 연락처 카드/미선정 안내 등록"
```

---

## 검증 체크리스트 (실행 후)

- [ ] `awarded` 구매사 딜룸 → 선정 PG 담당자 카드(이메일 mailto, 전화 있으면 tel) 노출.
- [ ] `awarded` 선정 PG 딜룸 → 구매사 담당자 카드 노출.
- [ ] `awarded` 미선정 PG 딜룸 → 미선정 안내만, 연락처 없음. 페이로드에 구매사 이메일/전화 없음.
- [ ] `sent`/`closed`/`cancelled` → 카드/안내 없음(현행 유지).
- [ ] 전화 null → 전화 행 생략, 이메일은 노출.
- [ ] `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` 전부 green.
