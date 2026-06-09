# 견적 선정 완료 결과 화면 (Award Result Celebration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구매사가 견적을 선정하면 전체 화면 축하 결과 화면으로 전환해, 누구를 선정했는지·얻은 혜택을 직관적으로 보여주고 선정한 PG와 메시지로 이어준다.

**Architecture:** 선정 직후 `awardRfpAction` 성공 콜백에서 기존 `router.refresh()` 대신 클라이언트 상태로 전체 화면 `<AwardResult>` 오버레이를 띄운다(추가 fetch·라우트 없음, 1회성). 주 CTA는 신규 `getOrCreateConversationAction`으로 선정 PG와의 빈 대화를 보장하고 `/messages?c=<id>`로 이동한다. 서버 award 로직은 불변.

**Tech Stack:** Next.js App Router(React 19), TypeScript, Drizzle+PGlite(테스트), Vitest, `motion`/`canvas-confetti`(둘 다 설치됨), zod, 기존 `ImprovementSummary`·`ChatService` 재사용.

**실행 환경 주의 (이 레포):**
- 모든 명령은 워크트리 루트 `/Users/yeonseong/project/bidit/.claude/worktrees/feat+award-result-celebration`에서 실행.
- Node 20 강제(홈브루 node26은 jsdom localStorage를 깨뜨림): 단일 테스트는
  `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test <path>`.
- 신규 파일은 반드시 워크트리 경로 아래에 작성(절대경로가 메인 레포로 새지 않게 주의).

---

## File Structure

신규:
- `lib/server/actions/chat/getOrCreateConversationAction.ts` — 얇은 액션: 세션 검증 + `ChatService.getOrCreateConversation` 위임.
- `lib/server/actions/chat/__tests__/getOrCreateConversation.test.ts` — 액션 경유 PGlite 테스트.
- `components/rfp/comparison/AwardResult.tsx` — 전체 화면 결과 화면(히어로 + 혜택 요약 + CTA + 컨페티).
- `components/rfp/comparison/AwardResult.test.tsx` — jsdom 컴포넌트 테스트.

수정:
- `lib/server/services/chat.ts` — `getOrCreateConversation(counterpartyWorkspaceId, actor)` 메서드 추가.
- `lib/server/actions/chat/index.ts` (있으면) — 신규 액션 re-export.
- `components/rfp/comparison/FocusComparison.tsx` — `onAwarded`에서 결과 오버레이 상태 표시.
- `components/rfp/comparison/__tests__/FocusComparison.test.tsx` (또는 신규) — 오버레이 1회성 통합 테스트.
- `DESIGN.md` §9, `CLAUDE.md` 하드룰 — 축하 모먼트 예외 명문화.

---

## Task 1: `ChatService.getOrCreateConversation` + `getOrCreateConversationAction`

선정 PG와의 대화를 (없으면 생성) 보장하고 `conversationId`를 돌려주는 서버 경로. 메시지는 보내지 않는다. buyer↔PG 타입 검증은 `sendMessage`와 동일하게 서비스가 소유.

**Files:**
- Modify: `lib/server/services/chat.ts` (클래스에 메서드 추가 — 기존 `sendMessage` 아래)
- Create: `lib/server/actions/chat/getOrCreateConversationAction.ts`
- Test: `lib/server/actions/chat/__tests__/getOrCreateConversation.test.ts`

- [ ] **Step 1: 액션 경유 실패 테스트 작성**

`lib/server/actions/chat/__tests__/getOrCreateConversation.test.ts` 생성. 세션 mock·시드 헬퍼는 인접한 `sendChatMessage.test.ts`의 패턴을 그대로 따른다.

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { chatConversations, chatMessages } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

type SessionUser = {
  id: string;
  email: string;
  workspaceId: string;
  workspaceType: 'buyer' | 'pg';
  role: 'admin' | 'member';
};
const sessionRef: { value: { user: SessionUser } | null } = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import { getOrCreateConversationAction } from '../getOrCreateConversationAction';

let db: PgliteDB;

async function seedPair() {
  const buyerUser = await seedUser(db, { email: 'buyer@b.com', name: '구매사담당' });
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사' });
  await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
  const pgUser = await seedUser(db, { email: 'sales@pg.com', name: 'PG영업' });
  const pgWs = await seedPgWorkspace(db, 'PG', { name: 'OO페이' });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  return { buyerUser, buyerWs, pgUser, pgWs };
}

function asBuyer(u: { id: string; email: string }, wsId: string) {
  sessionRef.value = {
    user: { id: u.id, email: u.email, workspaceId: wsId, workspaceType: 'buyer', role: 'admin' },
  };
}

describe('getOrCreateConversationAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('대화가 없으면 생성하고 conversationId를 반환한다', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const r = await getOrCreateConversationAction(pgWs.id);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.conversationId).toMatch(/[0-9a-f-]{36}/);

    const convs = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, r.conversationId));
    expect(convs).toHaveLength(1);
    expect(convs[0].buyerWsId).toBe(buyerWs.id);
    expect(convs[0].pgWsId).toBe(pgWs.id);
  });

  it('이미 있으면 같은 conversationId를 반환한다 (멱등)', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const first = await getOrCreateConversationAction(pgWs.id);
    const second = await getOrCreateConversationAction(pgWs.id);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.conversationId).toBe(first.conversationId);
  });

  it('메시지를 전송하지 않는다 (메시지 0건 유지)', async () => {
    const { buyerUser, buyerWs, pgWs } = await seedPair();
    asBuyer(buyerUser, buyerWs.id);

    const r = await getOrCreateConversationAction(pgWs.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const msgs = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, r.conversationId));
    expect(msgs).toHaveLength(0);
  });

  it('상대가 같은 타입이면 INVALID_COUNTERPARTY로 거절한다', async () => {
    const { buyerUser, buyerWs } = await seedPair();
    const otherBuyerWs = await seedBuyerWorkspace(db, { name: '다른구매사' });
    asBuyer(buyerUser, buyerWs.id);

    const r = await getOrCreateConversationAction(otherBuyerWs.id);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('INVALID_COUNTERPARTY');
  });

  it('비로그인 시 UNAUTHENTICATED를 반환한다', async () => {
    sessionRef.value = null;
    const r = await getOrCreateConversationAction('00000000-0000-0000-0000-000000000000');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('UNAUTHENTICATED');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/chat/__tests__/getOrCreateConversation.test.ts`
Expected: FAIL — `Cannot find module '../getOrCreateConversationAction'` (액션 미존재).

- [ ] **Step 3: 서비스 메서드 추가**

`lib/server/services/chat.ts`의 `ChatService` 클래스 안, `sendMessage` 메서드 바로 뒤에 추가. `sendMessage`의 타입검증 로직(현행 라인 106–117)을 그대로 차용한다. 트랜잭션 불필요 — `findOrCreatePair`가 단일 멱등 insert.

```ts
  /**
   * 상대 워크스페이스와의 대화를 보장한다(없으면 생성). 메시지는 보내지 않는다 —
   * 결과 화면의 "메시지 시작" CTA가 빈 대화로 딥링크하기 위한 경로. buyer↔PG
   * 타입 불변식은 sendMessage와 동일하게 여기서 검증한다.
   */
  async getOrCreateConversation(
    counterpartyWorkspaceId: string,
    actor: ChatActor,
  ): Promise<ServiceResult<{ conversationId: string }>> {
    const counterparty = await this.wsRepo.findById(counterpartyWorkspaceId);
    if (!counterparty) return { ok: false, error: 'COUNTERPARTY_NOT_FOUND' };
    if (counterparty.type === actor.workspaceType) {
      return { ok: false, error: 'INVALID_COUNTERPARTY' };
    }
    const buyerWsId = actor.workspaceType === 'buyer' ? actor.workspaceId : counterpartyWorkspaceId;
    const pgWsId = actor.workspaceType === 'buyer' ? counterpartyWorkspaceId : actor.workspaceId;
    const conv = await this.convRepo.findOrCreatePair(buyerWsId, pgWsId);
    return { ok: true, conversationId: conv.id };
  }
```

- [ ] **Step 4: 액션 작성**

`lib/server/actions/chat/getOrCreateConversationAction.ts` 생성. `sendChatMessageAction`의 세션·결과 패턴을 따른다.

```ts
'use server';

import { z } from 'zod';

import { getChatService } from '@/lib/server/services/chat';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

const Input = z.string().uuid();

export type GetOrCreateConversationResult = ChatActionResult<{ conversationId: string }>;

/**
 * 선정 결과 화면의 "메시지 시작" CTA용 — 상대 워크스페이스와의 대화를 보장하고
 * conversationId를 돌려준다. 메시지는 보내지 않는다. 빈 대화는 인박스 목록·
 * `/messages?c=<id>` 딥링크에서 그대로 열린다(작성란 노출).
 */
export async function getOrCreateConversationAction(
  counterpartyWorkspaceId: string,
): Promise<GetOrCreateConversationResult> {
  const parsed = Input.safeParse(counterpartyWorkspaceId);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const service = await getChatService();
  return service.getOrCreateConversation(parsed.data, {
    userId: ws.userId,
    workspaceId: ws.workspaceId,
    workspaceType: ws.workspaceType,
  });
}
```

- [ ] **Step 5: 액션 re-export (index가 있으면)**

`lib/server/actions/chat/index.ts`가 존재하면 한 줄 추가. 없으면 이 스텝 건너뜀(직접 경로 import 사용).

```ts
export { getOrCreateConversationAction } from './getOrCreateConversationAction';
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/chat/__tests__/getOrCreateConversation.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: 커밋**

```bash
git add lib/server/services/chat.ts lib/server/actions/chat/getOrCreateConversationAction.ts lib/server/actions/chat/__tests__/getOrCreateConversation.test.ts lib/server/actions/chat/index.ts
git commit -m "feat(chat): 선정 PG와의 빈 대화 보장 액션(getOrCreateConversation)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `AwardResult` 전체 화면 결과 컴포넌트

선정 직후의 축하 결과 화면. 히어로(선정 PG·완료) + 혜택 요약(`ImprovementSummary` 재사용) + 컨페티 + 두 CTA. 컨페티·reduced-motion 패턴은 `components/pending-approval/approval-waiting-screen.tsx`를 차용.

**Files:**
- Create: `components/rfp/comparison/AwardResult.tsx`
- Test: `components/rfp/comparison/AwardResult.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`approval-waiting-screen.test.tsx`의 mock 패턴(canvas-confetti/motion/next-navigation, matchMedia)을 그대로 따른다.

```tsx
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Bid } from '@/lib/types/bid';
import { AwardResult } from '@/components/rfp/comparison/AwardResult';

const { routerPushMock } = vi.hoisted(() => ({ routerPushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: vi.fn(() => ({ push: routerPushMock })) }));

const { getOrCreateMock } = vi.hoisted(() => ({ getOrCreateMock: vi.fn() }));
vi.mock('@/lib/server/actions/chat/getOrCreateConversationAction', () => ({
  getOrCreateConversationAction: getOrCreateMock,
}));

const { fireMock } = vi.hoisted(() => {
  const fn = Object.assign(vi.fn(), { reset: vi.fn() });
  return { fireMock: fn };
});
vi.mock('canvas-confetti', () => ({
  default: Object.assign(vi.fn(), { create: vi.fn(() => fireMock), reset: vi.fn() }),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: () => ({ children, style, className }: Record<string, unknown>) =>
        <div style={style as React.CSSProperties} className={className as string}>{children as React.ReactNode}</div>,
    },
  ),
  useAnimation: vi.fn(() => ({ start: vi.fn() })),
}));

function makeBid(over: Partial<Bid> = {}): Bid {
  return {
    id: 'bid-1',
    rfpId: 'rfp-1',
    pgWsId: 'pg-ws-1',
    invitationId: 'inv-1',
    settleCycle: 'D+1',
    settleLimit: 50_000_000,
    guaranteeInsurance: 0,
    paymentFees: { card: 0.021 }, // 소수 요율 = 2.1% (paymentFees 스케일)
    customFees: {},
    proposalPdfs: [],
    status: 'submitted',
    submittedBy: 'u-1',
    boardColumnId: null,
    ...over,
  };
}

beforeEach(() => {
  routerPushMock.mockClear();
  getOrCreateMock.mockReset();
  fireMock.mockClear();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});
afterEach(cleanup);

describe('AwardResult', () => {
  const baseProps = {
    pgName: '토스페이먼츠',
    pgWsId: 'pg-ws-1',
    bid: makeBid(),
    tier: 'general' as const,
  };

  it('선정한 PG명과 완료 문구를 렌더한다', () => {
    render(<AwardResult {...baseProps} current={{}} />);
    expect(screen.getByText(/토스페이먼츠를 선정했어요/)).toBeInTheDocument();
    expect(screen.getByText(/견적 요청이 마무리됐어요/)).toBeInTheDocument();
  });

  it('현재 조건이 있으면 개선 델타(↓)를 렌더한다', () => {
    render(
      <AwardResult
        {...baseProps}
        current={{ feeRate: '2.5%' }}
      />,
    );
    // ImprovementSummary가 카드 수수료 행 + 델타 배지를 그린다
    expect(screen.getByTestId('metric-row-card')).toBeInTheDocument();
    expect(screen.getByText(/0\.40%p/)).toBeInTheDocument();
  });

  it('현재 조건이 없으면 화살표 없이 사실만 표기한다(폴백)', () => {
    render(<AwardResult {...baseProps} current={{}} />);
    expect(screen.queryAllByTestId('metric-arrow')).toHaveLength(0);
  });

  it('마운트 시 컨페티를 발사한다', () => {
    render(<AwardResult {...baseProps} current={{}} />);
    expect(fireMock).toHaveBeenCalled();
  });

  it('주 CTA 클릭 시 대화를 보장하고 /messages?c=<id>로 이동한다', async () => {
    getOrCreateMock.mockResolvedValue({ ok: true, conversationId: 'conv-9' });
    render(<AwardResult {...baseProps} current={{}} />);
    await userEvent.setup().click(
      screen.getByRole('button', { name: /메시지/ }),
    );
    expect(getOrCreateMock).toHaveBeenCalledWith('pg-ws-1');
    expect(routerPushMock).toHaveBeenCalledWith('/messages?c=conv-9');
  });

  it('보조 CTA 클릭 시 /rfp로 이동한다', async () => {
    render(<AwardResult {...baseProps} current={{}} />);
    await userEvent.setup().click(
      screen.getByRole('button', { name: '견적 목록으로' }),
    );
    expect(routerPushMock).toHaveBeenCalledWith('/rfp');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/rfp/comparison/AwardResult.test.tsx`
Expected: FAIL — `Cannot find module '@/components/rfp/comparison/AwardResult'`.

- [ ] **Step 3: 컴포넌트 구현**

`components/rfp/comparison/AwardResult.tsx` 생성. 컨페티·reduced-motion은 `approval-waiting-screen.tsx`의 `confetti.create(..., { disableForReducedMotion: true })` 패턴을 그대로 사용. 혜택 요약은 `ImprovementSummary` 재사용. 디자인 토큰(`--md-sys-*`)·`UX_WRITING.md` 해요체 준수.

```tsx
'use client';

// 견적 선정 직후 1회만 뜨는 전체 화면 축하 결과 — 히어로(선정 PG·완료) + 혜택 요약
// (ImprovementSummary 재사용) + 컨페티(approval-waiting-screen 패턴 차용). 주 CTA는
// getOrCreateConversationAction으로 선정 PG와의 빈 대화를 보장하고 메시지로 딥링크.
// Linear 하드룰의 "축하 모먼트" 승인 예외(DESIGN.md §9) — 이 화면 한정.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';
import { Button } from '@/components/primitives/Button';
import { ImprovementSummary, type CurrentConditions } from './ImprovementSummary';
import { getOrCreateConversationAction } from '@/lib/server/actions/chat/getOrCreateConversationAction';
import type { Bid, MerchantTier } from '@/lib/types/bid';

export function AwardResult({
  pgName,
  pgWsId,
  bid,
  current,
  tier = 'general',
}: {
  pgName: string;
  pgWsId: string;
  bid: Bid;
  current: CurrentConditions;
  tier?: MerchantTier;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fireRef = useRef<ReturnType<typeof confetti.create> | null>(null);
  const [starting, setStarting] = useState(false);

  const fire = useCallback(() => {
    const run = fireRef.current;
    if (!run) return;
    const primary =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--md-sys-color-primary')
        .trim() || '#0061A4';
    const shared = { colors: [primary], scalar: 1, ticks: 250 };
    run({ ...shared, particleCount: 80, angle: 60, spread: 60, startVelocity: 65, origin: { x: 0, y: 0.65 } });
    run({ ...shared, particleCount: 80, angle: 120, spread: 60, startVelocity: 65, origin: { x: 1, y: 0.65 } });
    run({ ...shared, particleCount: 120, spread: 180, startVelocity: 40, gravity: 0.6, origin: { x: 0.5, y: 0 } });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fireRef.current = confetti.create(canvas, {
      resize: true,
      useWorker: false,
      disableForReducedMotion: true,
    });
    fire();
    return () => {
      fireRef.current?.reset();
      fireRef.current = null;
    };
  }, [fire]);

  const startMessage = async () => {
    if (starting) return;
    setStarting(true);
    const r = await getOrCreateConversationAction(pgWsId);
    if (r.ok) {
      router.push(`/messages?c=${r.conversationId}`);
      return;
    }
    // 실패 시에도 사용자를 가두지 않는다 — 메시지 목록으로.
    setStarting(false);
    router.push('/messages');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--md-sys-color-surface)] px-6">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="relative z-10 flex w-full max-w-[480px] flex-col items-center gap-6 text-center"
      >
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]">
          <Check className="size-8" strokeWidth={2} />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="text-title-large">{pgName}를 선정했어요</h1>
          <p className="text-body-medium text-on-surface-variant">견적 요청이 마무리됐어요</p>
        </div>

        <div className="w-full text-left">
          <ImprovementSummary bid={bid} current={current} tier={tier} />
        </div>

        <div className="flex w-full flex-col gap-2">
          <Button onClick={startMessage} disabled={starting}>
            {starting ? 'LOADING…' : `${pgName}와 메시지 시작 →`}
          </Button>
          <Button variant="text" onClick={() => router.push('/rfp')}>
            견적 목록으로
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
```

> 참고: `Button`의 `variant` 값(`'text'`/`'outlined'` 등)은 `components/primitives/Button.tsx`의 실제 타입에 맞춰 사용. 보조 CTA는 낮은 강조 변형이면 무엇이든 무방하되, 테스트는 접근성 이름 `견적 목록으로`만 의존한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/rfp/comparison/AwardResult.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add components/rfp/comparison/AwardResult.tsx components/rfp/comparison/AwardResult.test.tsx
git commit -m "feat(rfp): 견적 선정 완료 축하 결과 화면 AwardResult

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `FocusComparison`에 결과 오버레이 연결 (1회성)

선정 성공 시에만 결과 화면을 띄운다. 이미 선정된 RFP를 처음 열 때는 띄우지 않는다(1회성 불변식).

**Files:**
- Modify: `components/rfp/comparison/FocusComparison.tsx`
- Test: `components/rfp/comparison/__tests__/FocusComparison.test.tsx` (없으면 생성)

- [ ] **Step 1: 실패 테스트 작성 (1회성 + 발화)**

기존 `FocusComparison` 테스트 파일이 있으면 그 파일에 `describe('award result overlay', ...)`를 추가한다. 없으면 아래로 새로 생성. `AwardResult`는 자식이라 mock해 "표시 여부"만 검증(컨페티/대화 액션은 Task 2가 커버).

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Bid } from '@/lib/types/bid';
import { FocusComparison } from '@/components/rfp/comparison/FocusComparison';

vi.mock('next/navigation', () => ({ useRouter: vi.fn(() => ({ refresh: vi.fn(), push: vi.fn() })) }));

// award 액션은 성공으로 고정 — 다이얼로그 확정 경로만 본다.
vi.mock('@/lib/server/actions/rfp', () => ({
  awardRfpAction: vi.fn().mockResolvedValue({ ok: true }),
}));

// 결과 오버레이는 표시 여부만 검증한다(내부는 Task 2가 커버).
vi.mock('@/components/rfp/comparison/AwardResult', () => ({
  AwardResult: ({ pgName }: { pgName: string }) => (
    <div data-testid="award-result">{pgName} 선정 완료</div>
  ),
}));

function makeBid(over: Partial<Bid> = {}): Bid {
  return {
    id: 'bid-1', rfpId: 'rfp-1', pgWsId: 'pg-ws-1', invitationId: 'inv-1',
    settleCycle: 'D+1', settleLimit: 50_000_000, guaranteeInsurance: 0,
    paymentFees: { card: 0.021 }, customFees: {}, proposalPdfs: [],
    status: 'submitted', submittedBy: 'u-1', boardColumnId: null, ...over,
  };
}

const baseProps = {
  bids: [makeBid()],
  pgWsNameMap: { 'pg-ws-1': '토스페이먼츠' },
  current: {},
  notesByBid: {},
  requiredPaymentMethods: ['card'] as const,
  customPaymentMethods: [],
  rfpId: '11111111-1111-1111-1111-111111111111',
  rfpCode: 'P-2605-0042',
};

afterEach(cleanup);

describe('FocusComparison · award result overlay', () => {
  it('이미 선정된 RFP를 처음 열면 결과 오버레이를 띄우지 않는다', () => {
    render(
      <FocusComparison {...baseProps} rfpStatus="awarded" awardedBidId="bid-1" />,
    );
    expect(screen.queryByTestId('award-result')).not.toBeInTheDocument();
  });

  it('선정을 확정하면 결과 오버레이를 띄운다', async () => {
    const user = userEvent.setup();
    render(<FocusComparison {...baseProps} rfpStatus="sent" awardedBidId={null} />);

    await user.click(screen.getByRole('button', { name: /이 견적 선정하기/ }));
    await user.click(screen.getByRole('button', { name: '선정할게요' }));

    expect(await screen.findByTestId('award-result')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/rfp/comparison/__tests__/FocusComparison.test.tsx`
Expected: 첫 테스트는 PASS(현재도 오버레이 없음), **두 번째 테스트 FAIL** — 확정 후 `award-result`가 나타나지 않음(현재는 `router.refresh()`만 함).

- [ ] **Step 3: FocusComparison 수정**

`AwardResult` import 추가, 결과 상태 추가, `onAwarded`에서 상태 set, 상태가 있으면 오버레이 렌더. `AwardConfirmDialog`는 변경 불필요(`onAwarded` 콜백을 이미 받음).

import 블록에 추가:
```tsx
import { AwardResult } from './AwardResult';
```

`const [dialogOpen, setDialogOpen] = useState(false);` 아래에 추가:
```tsx
  // 선정 확정 직후 1회만 뜨는 결과 화면. 초기 awarded 로드로는 set되지 않는다(1회성).
  const [resultBid, setResultBid] = useState<Bid | null>(null);
```

`return (` 직후 첫 줄에서, 결과 상태가 있으면 오버레이를 먼저 렌더(early return):
```tsx
  if (resultBid) {
    return (
      <AwardResult
        pgName={pgName(resultBid.pgWsId)}
        pgWsId={resultBid.pgWsId}
        bid={resultBid}
        current={current}
        tier={tier}
      />
    );
  }
```
(주의: 이 early return은 `active`/`pgName`/`current`/`tier`가 정의된 뒤에 와야 한다 — `const peek = ...` 라인 다음, 즉 `feeRows` 계산 전이나 `return (` 바로 위에 배치. `pgName`은 라인 80, `active`는 라인 79에 이미 정의됨.)

`AwardConfirmDialog`의 `onAwarded`를 교체:
```tsx
        onAwarded={() => setResultBid(active)}
```
(기존 `onAwarded={() => router.refresh()}` 삭제. `useRouter`는 다른 곳에서 계속 쓰지 않으면 미사용 경고가 날 수 있으니, 남은 사용처가 없으면 `router`/`useRouter` import도 정리.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/rfp/comparison/__tests__/FocusComparison.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: 인접 회귀 + 타입 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/rfp/comparison`
Expected: 해당 디렉터리 테스트 전부 PASS.

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach|afterEach)'" | grep "comparison\|AwardResult\|getOrCreateConversation" || echo "no new type errors in scope"`
Expected: `no new type errors in scope` (기존 테스트 글로벌 노이즈는 무시 — 메모리 참조).

- [ ] **Step 6: 커밋**

```bash
git add components/rfp/comparison/FocusComparison.tsx components/rfp/comparison/__tests__/FocusComparison.test.tsx
git commit -m "feat(rfp): 선정 확정 시 결과 화면 오버레이 표시(1회성)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 디자인 원칙에 "축하 모먼트" 예외 명문화

`canvas-confetti`·강한 모션을 전면 금지하던 규칙에, 좁게 한정된 예외를 추가한다. 순수 문서 변경(TDD 면제) — 단, 규칙 표현이 코드 동작과 어긋나지 않게 정확히 기술.

**Files:**
- Modify: `DESIGN.md` (§9 안티패턴 절)
- Modify: `CLAUDE.md` ("Linear Design Language — Hard Rules" 블록)

- [ ] **Step 1: DESIGN.md §9에 carve-out 추가**

`DESIGN.md`를 열어 §9(anti-patterns)에서 컨페티/펄스/강한 모션을 금지하는 항목을 찾는다. 그 절 끝에 아래 블록을 추가(주변 마크다운 스타일에 맞춰 들여쓰기):

```markdown
> **예외 — 축하 모먼트 (Celebration Moment).** 위의 컨페티·강한 모션 금지에는
> 단 하나의 좁은 예외가 있다. 다음 4조건을 **모두** 만족하는 종결 성공 순간에 한해
> 1회성 컨페티/강조 모션을 허용한다:
> ① 사용자가 직접 일으킨 액션의 결과일 것,
> ② 되돌릴 수 없는 종결(terminal) 성공 이벤트일 것,
> ③ 1회성일 것(재방문·재렌더로 반복 발화 금지),
> ④ `prefers-reduced-motion: reduce`를 존중하고(컨페티 `disableForReducedMotion`),
>    네온·그라데이션 없이 브랜드 컬러만 사용할 것.
> 현재 등록된 발동 지점: **(1) 입점 심사 대기 화면**(`approval-waiting-screen`),
> **(2) 견적 선정 완료 결과 화면**(`AwardResult`). 새 발동 지점을 추가할 때는
> 위 4조건 충족을 PR에서 명시할 것.
```

- [ ] **Step 2: CLAUDE.md 하드룰에 예외 포인터 추가**

`CLAUDE.md`의 "Linear Design Language — Hard Rules" 목록에서 모션/펄스 관련 줄을 찾아, 해당 줄 끝에 예외 참조를 덧붙인다. 구체적으로 아래 항목을 찾아 수정:

찾기:
```
- **No** pulse/spinner loading. Use `LOADING…` text (body-medium type).
```
바꾸기:
```
- **No** pulse/spinner loading. Use `LOADING…` text (body-medium type). (예외: DESIGN.md §9 "축하 모먼트" — 종결 성공 1회성에 한해 컨페티 허용.)
```

그리고 찾기:
```
- **Motion** animates transform/opacity/color only (never layout); cause→effect under ~100ms (`duration-short-4`).
```
바꾸기:
```
- **Motion** animates transform/opacity/color only (never layout); cause→effect under ~100ms (`duration-short-4`). 단, DESIGN.md §9의 "축하 모먼트" 예외(종결 성공 1회성 컨페티)는 별도.
```

- [ ] **Step 3: 문서 정합 점검**

Run: `grep -n "축하 모먼트" DESIGN.md CLAUDE.md`
Expected: DESIGN.md 1+건, CLAUDE.md 2건 매칭.

- [ ] **Step 4: 커밋**

```bash
git add DESIGN.md CLAUDE.md
git commit -m "docs(design): 종결 성공 1회성 '축하 모먼트' 예외 명문화

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 전체 헬스 체크

**Files:** 없음(검증만)

- [ ] **Step 1: 스코프 테스트 일괄**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/rfp/comparison lib/server/actions/chat`
Expected: 전부 PASS.

- [ ] **Step 2: lint**

Run: `pnpm lint`
Expected: 신규 파일에 신규 경고 없음. (RTK vs raw eslint `no-var` 불일치는 기존 이슈 — 무시. 메모리 참조.)

- [ ] **Step 3: 전체 유닛 (여력 될 때)**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test`
Expected: 그린. 단, 알려진 플레이크(BidForm draft localStorage 타이밍, dev PG-landing host 테스트)는 재실행/무시 — 메모리 참조. 신규 회귀가 아니면 추격 금지.

---

## 검토 체크리스트 (작성자 self-review 결과)

- **스펙 커버리지**: §3 접근(A안)=Task 3, §4 화면구성=Task 2, §5 모션=Task 2, §6 메시지 연결=Task 1, §8 디자인 원칙=Task 4, §9 테스트=각 Task에 분산. 누락 없음.
- **서버 불변(§7)**: `awardRfpAction`/`RfpService.award` 미변경 — 어떤 Task도 건드리지 않음. ✓
- **타입 일관성**: `getOrCreateConversationAction(counterpartyWorkspaceId: string)` → `ChatActionResult<{conversationId}>`; `ChatService.getOrCreateConversation(id, actor)` → `ServiceResult<{conversationId}>`; `AwardResult` props(`pgName/pgWsId/bid/current/tier`) — Task 2·3에서 동일 사용. ✓
- **플레이스홀더**: 없음(모든 코드 스텝에 실제 코드 포함). ✓
- **열린 항목**: 없음(메시지 연결까지 조사로 확정). ✓
