# 딜룸 전자서명 '계약' 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선정 후 전자서명 안내를 딜룸 전용 '계약' 탭(맨 앞·기본 활성)으로 옮기고, 8개 상태를 헤더·타임라인·액션바 하나의 시각 문법으로 통일한다.

**Architecture:** 상태 × 역할 파생을 순수 함수(`signing-view-model.ts`) 하나에 모으고, 렌더 컴포넌트(`SigningTab` / `SigningTimeline` / `SigningSummaryStrip` / `AwardContextLine`)는 그 결과를 그리기만 한다. 서버(로더·액션·서비스·리포지토리)는 전혀 손대지 않는다 — `lib/server/rfp-detail-loader.ts`가 이미 내려주는 `signing: SigningView | null` 하나로 탭 존재·기본 탭·도트 색·카드 내용이 모두 결정된다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 + CSS 변수 토큰, Vitest + Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-21-signing-contract-tab-design.md` (시안: 같은 폴더 `…-mockup.html`)

## Global Constraints

- **TDD 필수** — 모든 단계에서 실패하는 테스트를 먼저 확인한다(RED를 눈으로 본 뒤 구현). 프로젝트 `CLAUDE.md`의 Iron Law.
- **Linear 하드룰** — pill 버튼 금지(`shape-small` 6px), 본문 16px 이상 금지, 색면 배너 대신 저대비 경계선, 상태는 `Chip` 컴포넌트로만 표시, 숫자는 `.md-numeric`.
- **UX 라이팅** — 해요체·능동형·긍정형(`UX_WRITING.md`). 실패 상태 안내문은 사용자가 잃은 것이 없음을 먼저 말한다("선정 결과는 그대로예요").
- **용어** — 사용자 화면은 '견적 요청'·'견적'·'선정' 언어. 코드 식별자는 영어 그대로.
- **에러 문구 SSOT** — 서버 액션 실패 토스트는 반드시 `signingErrorMessage(code, fallback)` (`lib/signing/error-messages.ts`)를 통과시킨다. raw 에러 코드를 사용자에게 노출하지 않는다.
- **서버 무변경** — `lib/server/**`, `app/api/**`, DB 스키마, 알림 문구는 이 계획의 범위 밖.
- **테스트 실행** — 단일 파일은 `pnpm test <path>`, 전체는 `pnpm test`. 워크트리에서 `node_modules`는 메인 레포 심링크를 쓴다.
- **커밋** — 각 Task 끝에 1커밋. pre-commit 훅이 풀레포 lint+tsc를 돌려 느리다(정상).

---

## File Structure

```
components/deal-room/signing/
├─ signing-view-model.ts       # (SigningView, side) → SigningCardView. 순수, DOM 무관
├─ SigningTimeline.tsx         # SigningNode[] 렌더. 표시 전용, 상태 없음
├─ SigningTab.tsx              # 3구역 카드 셸 + 서버 액션 실행 + 다운로드 (구 SigningPanel)
├─ SigningSummaryStrip.tsx     # 다른 탭에 남는 38px 한 줄 요약 + onOpen 콜백
├─ AwardContextLine.tsx        # 계약 탭 상단 한 줄: 선정 PG · 담당자 · [메시지]
└─ __tests__/…                 # 위 5개 각각

components/primitives/Chip.tsx           # TONE_COLOR_VAR 추가 (수정)
components/deal-room/DealRoomActionRail.tsx  # RailAction.dot 추가 (수정)
components/deal-room/buyer/BuyerDealRoomBody.tsx  # 탭 재구성 (수정)
components/deal-room/pg/PgDealRoomBody.tsx        # 탭 재구성 (수정)

components/deal-room/SigningPanel.tsx             # 삭제
components/deal-room/__tests__/SigningPanel.test.tsx  # 삭제(케이스는 SigningTab.test로 이관)
```

---

### Task 1: 상태 파생 순수 함수 `signing-view-model.ts`

카드가 그릴 모든 것(아이콘·제목·칩·노드 4개·액션·문서·안내문)을 상태와 역할에서 파생한다. 이 파일이 스펙 표의 코드판이다.

**Files:**
- Create: `components/deal-room/signing/signing-view-model.ts`
- Test: `components/deal-room/signing/__tests__/signing-view-model.test.ts`

**Interfaces:**
- Consumes: `SigningView` / `SigningContract` / `SigningParticipant` (`@/lib/types/signing`), `ChipColor` (`@/components/primitives/Chip`)
- Produces:
  - `type SigningSide = 'buyer' | 'pg'`
  - `type SigningNodeState = 'done' | 'active' | 'pending' | 'failed'`
  - `type SigningIcon = 'clock' | 'alert' | 'pen' | 'check' | 'x' | 'slash'`
  - `type SigningActionId = 'remind' | 'cancel' | 'resend' | 'template'`
  - `type SigningNode = { key; kind: 'milestone'|'person'; label; detail?; sub?; state: SigningNodeState; chip?: {color: ChipColor; label: string}; at?: string; initial? }`
  - `type SigningAction = { id: SigningActionId; label: string; variant: 'filled'|'outlined'|'text'; danger?: boolean }`
  - `type SigningDoc = { id: 'document'|'audit'; title: string; caption: string }`
  - `type SigningCardView = { icon; tone: ChipColor; title; description; chip; nodes: SigningNode[]; docs: SigningDoc[]; actions: SigningAction[]; note: string }`
  - `buildSigningCardView(signing: SigningView, side: SigningSide): SigningCardView`
  - `buildSigningSummary(signing: SigningView, side: SigningSide): { label: string; dot: ChipColor; signed?: number; total?: number }`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`components/deal-room/signing/__tests__/signing-view-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

import { buildSigningCardView, buildSigningSummary } from '../signing-view-model';
import type {
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantRole,
  SigningParticipantStatus,
  SigningView,
} from '@/lib/types/signing';

function part(
  role: SigningParticipantRole,
  status: SigningParticipantStatus,
  over: Partial<SigningParticipant> = {},
): SigningParticipant {
  return {
    id: role,
    contractId: 'c1',
    name: role === 'buyer' ? '김구매' : '이대행',
    email: `${role}@x.com`,
    role,
    securityMethod: 'easy_cert',
    status,
    ...over,
  };
}

function view(status: SigningContractStatus, participants: SigningParticipant[] = []): SigningView {
  return {
    contract: {
      id: 'c1',
      rfpId: 'r1',
      status,
      round: 1,
      createdBy: 'u',
      createdAt: '2026-07-20T04:40:00Z',
      sentAt: '2026-07-20T05:02:00Z',
      ...(status === 'completed' ? { completedAt: '2026-07-21T01:24:00Z' } : {}),
      ...(status === 'canceled' ? { canceledAt: '2026-07-20T08:05:00Z' } : {}),
    },
    participants,
  };
}

const bothPending = [part('buyer', 'pending'), part('pg', 'pending')];

describe('buildSigningCardView', () => {
  it('모든 상태가 노드 4개와 헤더·안내문을 채운다', () => {
    const statuses: SigningContractStatus[] = [
      'awaiting_pg_template',
      'sent',
      'in_progress',
      'completed',
      'declined',
      'expired',
      'canceled',
      'send_failed',
    ];
    for (const status of statuses) {
      for (const side of ['buyer', 'pg'] as const) {
        const v = buildSigningCardView(view(status, bothPending), side);
        expect(v.nodes, `${status}/${side}`).toHaveLength(4);
        expect(v.title.length, `${status}/${side}`).toBeGreaterThan(0);
        expect(v.note.length, `${status}/${side}`).toBeGreaterThan(0);
        expect(v.chip.label.length, `${status}/${side}`).toBeGreaterThan(0);
      }
    }
  });

  it('awaiting_pg_template — 구매사는 대기 안내만, 액션이 없다', () => {
    const v = buildSigningCardView(view('awaiting_pg_template'), 'buyer');
    expect(v.title).toBe('PG사가 계약서를 준비하고 있어요');
    expect(v.chip).toEqual({ color: 'warning', label: '계약서 준비 중' });
    expect(v.actions).toEqual([]);
    expect(v.nodes[1]).toMatchObject({ key: 'prepare', state: 'active' });
  });

  it('awaiting_pg_template — PG는 등록 CTA를 받는다', () => {
    const v = buildSigningCardView(view('awaiting_pg_template'), 'pg');
    expect(v.title).toBe('계약서 템플릿을 등록해 주세요');
    expect(v.chip).toEqual({ color: 'warning', label: '등록 필요' });
    expect(v.actions).toEqual([
      { id: 'template', label: '서명 템플릿 등록하기', variant: 'filled' },
    ]);
  });

  it('in_progress — 발송·참여자·완료 노드를 순서대로 만든다', () => {
    const v = buildSigningCardView(
      view('in_progress', [
        part('buyer', 'signed', { signedAt: '2026-07-20T06:10:00Z' }),
        part('pg', 'pending'),
      ]),
      'buyer',
    );
    expect(v.nodes.map((n) => n.kind)).toEqual(['milestone', 'person', 'person', 'milestone']);
    expect(v.nodes[0]).toMatchObject({ key: 'sent', state: 'done', at: '2026-07-20T05:02:00Z' });
    expect(v.nodes[1]).toMatchObject({ state: 'done', at: '2026-07-20T06:10:00Z', initial: '김' });
    expect(v.nodes[1].chip).toEqual({ color: 'tertiary', label: '서명 완료' });
    expect(v.nodes[2]).toMatchObject({ state: 'pending' });
    expect(v.nodes[2].chip).toEqual({ color: 'surface', label: '서명 대기' });
    expect(v.nodes[3]).toMatchObject({ key: 'done', state: 'pending' });
    expect(v.actions.map((a) => a.id)).toEqual(['remind', 'cancel']);
  });

  it('completed — 전 노드 완료 + 문서 2개', () => {
    const v = buildSigningCardView(
      view('completed', [
        part('buyer', 'signed', { signedAt: '2026-07-20T06:10:00Z' }),
        part('pg', 'signed', { signedAt: '2026-07-21T01:24:00Z' }),
      ]),
      'pg',
    );
    expect(v.nodes.every((n) => n.state === 'done')).toBe(true);
    expect(v.nodes[3].at).toBe('2026-07-21T01:24:00Z');
    expect(v.docs.map((d) => d.id)).toEqual(['document', 'audit']);
    expect(v.actions).toEqual([]);
  });

  it('declined — 거절 참여자와 종결 노드가 failed', () => {
    const v = buildSigningCardView(
      view('declined', [part('buyer', 'signed'), part('pg', 'rejected')]),
      'buyer',
    );
    expect(v.nodes[2]).toMatchObject({ state: 'failed' });
    expect(v.nodes[2].chip).toEqual({ color: 'error', label: '거절' });
    expect(v.nodes[3]).toMatchObject({ key: 'terminal', state: 'failed' });
    expect(v.actions).toEqual([{ id: 'resend', label: '다시 발송', variant: 'filled' }]);
  });

  it('expired·canceled — 미서명 참여자 칩이 "서명 안 함"', () => {
    for (const status of ['expired', 'canceled'] as const) {
      const v = buildSigningCardView(view(status, bothPending), 'buyer');
      expect(v.nodes[1].chip, status).toEqual({ color: 'surface', label: '서명 안 함' });
    }
  });

  it('send_failed — 발송 노드가 failed, 다시 시작 액션', () => {
    const v = buildSigningCardView(view('send_failed'), 'buyer');
    expect(v.nodes[1]).toMatchObject({ key: 'send', state: 'failed' });
    expect(v.actions).toEqual([{ id: 'resend', label: '다시 시작', variant: 'filled' }]);
  });
});

describe('buildSigningSummary', () => {
  it('진행 중이면 서명 수를 함께 돌려준다', () => {
    const s = buildSigningSummary(
      view('in_progress', [part('buyer', 'signed'), part('pg', 'pending')]),
      'buyer',
    );
    expect(s).toEqual({ label: '서명 진행 중', dot: 'primary', signed: 1, total: 2 });
  });

  it('진행 중이 아니면 개수 없이 상태 라벨만', () => {
    expect(buildSigningSummary(view('completed'), 'buyer')).toEqual({
      label: '서명 완료',
      dot: 'tertiary',
    });
    expect(buildSigningSummary(view('awaiting_pg_template'), 'pg')).toEqual({
      label: '등록 필요',
      dot: 'warning',
    });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm test components/deal-room/signing/__tests__/signing-view-model.test.ts`
Expected: FAIL — `Failed to resolve import "../signing-view-model"`

- [ ] **Step 3: 최소 구현을 작성한다**

`components/deal-room/signing/signing-view-model.ts`:

```ts
/**
 * 전자서명 카드의 상태 파생 — (SigningView, side) → 렌더 입력.
 *
 * 상태 × 역할 조합의 진실은 전부 여기 모인다. 렌더 컴포넌트(SigningTab /
 * SigningTimeline / SigningSummaryStrip)는 결과를 그리기만 한다. DOM·React 의존이
 * 없으므로 8개 상태 × 2역할 매트릭스를 단위 테스트로 못박을 수 있다.
 */
import type { ChipColor } from '@/components/primitives/Chip';
import type { SigningContract, SigningParticipant, SigningView } from '@/lib/types/signing';

export type SigningSide = 'buyer' | 'pg';
export type SigningNodeState = 'done' | 'active' | 'pending' | 'failed';
export type SigningIcon = 'clock' | 'alert' | 'pen' | 'check' | 'x' | 'slash';
export type SigningActionId = 'remind' | 'cancel' | 'resend' | 'template';

export type SigningNode = {
  key: string;
  /** milestone = 10px 점, person = 28px 이니셜 디스크. */
  kind: 'milestone' | 'person';
  label: string;
  /** 사람 노드의 역할, 마일스톤의 한 줄 설명. */
  detail?: string;
  /** 사람 노드의 이메일·인증수단 보조 줄. */
  sub?: string;
  state: SigningNodeState;
  chip?: { color: ChipColor; label: string };
  /** ISO 8601 — 렌더 쪽에서 LocalTime 으로 표시. */
  at?: string;
  initial?: string;
};

export type SigningAction = {
  id: SigningActionId;
  label: string;
  variant: 'filled' | 'outlined' | 'text';
  danger?: boolean;
};

export type SigningDoc = { id: 'document' | 'audit'; title: string; caption: string };

export type SigningCardView = {
  icon: SigningIcon;
  /** 헤더 아이콘 색 계열 — Chip 색과 같은 어휘를 쓴다. */
  tone: ChipColor;
  title: string;
  description: string;
  chip: { color: ChipColor; label: string };
  /** 항상 4개 — 시작 → 사람/단계 → 사람/단계 → 종결. */
  nodes: SigningNode[];
  docs: SigningDoc[];
  actions: SigningAction[];
  note: string;
};

const roleLabel = (r: SigningParticipant['role']) => (r === 'buyer' ? '구매사' : 'PG');
const securityLabel = (m: SigningParticipant['securityMethod']) =>
  m === 'easy_cert' ? '휴대폰 간편인증' : '이메일 인증';

function personState(p: SigningParticipant): SigningNodeState {
  switch (p.status) {
    case 'signed':
      return 'done';
    case 'viewed':
      return 'active';
    case 'rejected':
      return 'failed';
    default:
      return 'pending';
  }
}

function personChip(
  p: SigningParticipant,
  unsignedLabel: string,
): { color: ChipColor; label: string } {
  switch (p.status) {
    case 'signed':
      return { color: 'tertiary', label: '서명 완료' };
    case 'viewed':
      return { color: 'primary', label: '열람함' };
    case 'rejected':
      return { color: 'error', label: '거절' };
    default:
      return { color: 'surface', label: unsignedLabel };
  }
}

function personNodes(
  participants: SigningParticipant[],
  unsignedLabel: string,
): SigningNode[] {
  return participants.map((p) => ({
    key: p.id,
    kind: 'person' as const,
    label: p.name,
    detail: roleLabel(p.role),
    sub: `${p.email} · ${securityLabel(p.securityMethod)}`,
    state: personState(p),
    chip: personChip(p, unsignedLabel),
    at: p.signedAt,
    initial: p.name.slice(0, 1),
  }));
}

/** 참여자가 아직 없는 상태(awaiting/send_failed)의 자리지기 2노드. */
function placeholderPair(): SigningNode[] {
  return [
    { key: 'sign', kind: 'milestone', label: '양측 서명', state: 'pending' },
    { key: 'done', kind: 'milestone', label: '계약 완료', state: 'pending' },
  ];
}

function sentNode(contract: SigningContract): SigningNode {
  return {
    key: 'sent',
    kind: 'milestone',
    label: '서명 요청을 보냈어요',
    state: 'done',
    at: contract.sentAt,
  };
}

export function buildSigningCardView(signing: SigningView, side: SigningSide): SigningCardView {
  const { contract, participants } = signing;
  const isPg = side === 'pg';

  switch (contract.status) {
    case 'awaiting_pg_template':
      return {
        icon: isPg ? 'alert' : 'clock',
        tone: 'warning',
        title: isPg ? '계약서 템플릿을 등록해 주세요' : 'PG사가 계약서를 준비하고 있어요',
        description: isPg
          ? '등록하는 즉시 이 계약의 서명이 자동으로 시작돼요.'
          : '준비되면 자동으로 양측에 서명 링크가 발송돼요.',
        chip: { color: 'warning', label: isPg ? '등록 필요' : '계약서 준비 중' },
        nodes: [
          {
            key: 'awarded',
            kind: 'milestone',
            label: isPg ? '이 견적이 선정됐어요' : '견적을 선정했어요',
            state: 'done',
            at: contract.createdAt,
          },
          {
            key: 'prepare',
            kind: 'milestone',
            label: isPg ? '계약서 등록' : '계약서 준비',
            detail: isPg
              ? '자사 계약서를 한 번만 등록하면 다음 선정부터도 자동으로 쓰여요'
              : 'PG사가 계약서를 등록하는 단계예요',
            state: 'active',
          },
          ...placeholderPair(),
        ],
        docs: [],
        actions: isPg
          ? [{ id: 'template', label: '서명 템플릿 등록하기', variant: 'filled' }]
          : [],
        note: isPg
          ? '서명칸 배치는 스노우싸인 화면에서 이뤄져요.'
          : '선정은 이미 확정됐어요 — 서명 준비와 무관하게 유지돼요.',
      };

    case 'sent':
    case 'in_progress':
      return {
        icon: 'pen',
        tone: 'primary',
        title: '서명을 기다리는 중이에요',
        description: '양측 담당자에게 이메일로 서명 링크를 보냈어요.',
        chip: { color: 'primary', label: '서명 진행 중' },
        nodes: [
          sentNode(contract),
          ...personNodes(participants, '서명 대기'),
          { key: 'done', kind: 'milestone', label: '계약 완료', state: 'pending' },
        ],
        docs: [],
        actions: [
          { id: 'remind', label: '리마인더 보내기', variant: 'outlined' },
          { id: 'cancel', label: '취소', variant: 'text', danger: true },
        ],
        note: '서명은 이메일 링크의 스노우싸인 페이지에서 진행돼요.',
      };

    case 'completed':
      return {
        icon: 'check',
        tone: 'tertiary',
        title: '모든 서명이 완료됐어요',
        description: '양측 서명이 끝났어요. 완료본을 내려받을 수 있어요.',
        chip: { color: 'tertiary', label: '서명 완료' },
        nodes: [
          sentNode(contract),
          ...personNodes(participants, '서명 대기'),
          {
            key: 'done',
            kind: 'milestone',
            label: '계약 완료',
            state: 'done',
            at: contract.completedAt,
          },
        ],
        docs: [
          { id: 'document', title: '계약서', caption: '양측 서명이 담긴 완료본 PDF' },
          { id: 'audit', title: '감사추적인증서', caption: '열람·서명 이력과 타임스탬프' },
        ],
        actions: [],
        note: '다운로드 링크는 열 때마다 새로 발급돼요.',
      };

    case 'declined':
      return {
        icon: 'x',
        tone: 'error',
        title: '서명이 거절됐어요',
        description: '조건을 다시 맞춘 뒤 새로 발송할 수 있어요.',
        chip: { color: 'error', label: '거절됨' },
        nodes: [
          sentNode(contract),
          ...personNodes(participants, '서명 안 함'),
          { key: 'terminal', kind: 'milestone', label: '서명이 중단됐어요', state: 'failed' },
        ],
        docs: [],
        actions: [{ id: 'resend', label: '다시 발송', variant: 'filled' }],
        note: '선정 결과는 그대로예요.',
      };

    case 'expired':
      return {
        icon: 'clock',
        tone: 'error',
        title: '서명 기한이 지났어요',
        description: '서명 링크가 만료됐어요. 다시 발송하면 새 링크가 나가요.',
        chip: { color: 'error', label: '만료됨' },
        nodes: [
          sentNode(contract),
          ...personNodes(participants, '서명 안 함'),
          {
            key: 'terminal',
            kind: 'milestone',
            label: '기한이 지났어요',
            state: 'failed',
            at: contract.expiresAt,
          },
        ],
        docs: [],
        actions: [{ id: 'resend', label: '다시 발송', variant: 'filled' }],
        note: '선정 결과는 그대로예요.',
      };

    case 'canceled':
      return {
        icon: 'slash',
        tone: 'surface',
        title: '전자서명이 취소됐어요',
        description: '진행 중이던 서명이 중단됐어요.',
        chip: { color: 'surface', label: '취소됨' },
        nodes: [
          sentNode(contract),
          ...personNodes(participants, '서명 안 함'),
          {
            key: 'terminal',
            kind: 'milestone',
            label: '취소했어요',
            state: 'pending',
            at: contract.canceledAt,
          },
        ],
        docs: [],
        actions: [{ id: 'resend', label: '다시 발송', variant: 'filled' }],
        note: '필요하면 다시 발송할 수 있어요.',
      };

    case 'send_failed':
      return {
        icon: 'alert',
        tone: 'error',
        title: '전자서명을 시작하지 못했어요',
        description: '전자서명 서비스에 일시적인 문제가 있었어요.',
        chip: { color: 'error', label: '시작 실패' },
        nodes: [
          {
            key: 'awarded',
            kind: 'milestone',
            label: isPg ? '이 견적이 선정됐어요' : '견적을 선정했어요',
            state: 'done',
            at: contract.createdAt,
          },
          {
            key: 'send',
            kind: 'milestone',
            label: '서명 발송',
            detail: '발송에 실패했어요',
            state: 'failed',
          },
          ...placeholderPair(),
        ],
        docs: [],
        actions: [{ id: 'resend', label: '다시 시작', variant: 'filled' }],
        note: '선정은 그대로 유지돼요.',
      };
  }
}

/** 요약 스트립·레일 도트용 축약. 진행 중일 때만 서명 수를 함께 준다. */
export function buildSigningSummary(
  signing: SigningView,
  side: SigningSide,
): { label: string; dot: ChipColor; signed?: number; total?: number } {
  const { chip } = buildSigningCardView(signing, side);
  const status = signing.contract.status;
  if (status === 'sent' || status === 'in_progress') {
    return {
      label: chip.label,
      dot: chip.color,
      signed: signing.participants.filter((p) => p.status === 'signed').length,
      total: signing.participants.length,
    };
  }
  return { label: chip.label, dot: chip.color };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm test components/deal-room/signing/__tests__/signing-view-model.test.ts`
Expected: PASS — 9 tests

- [ ] **Step 5: 커밋한다**

```bash
git add components/deal-room/signing/
git commit -m "feat(signing): 전자서명 카드 상태 파생 순수 함수"
```

---

### Task 2: 톤 색 변수 SSOT + 레일 상태 도트

레일 도트와 타임라인 마크가 같은 `ChipColor` 어휘로 색을 고르게 한다. 매핑을 두 곳에 복붙하지 않도록 `Chip.tsx`에 한 번만 둔다.

**Files:**
- Modify: `components/primitives/Chip.tsx` (`TONE_COLOR_VAR` export 추가)
- Modify: `components/deal-room/DealRoomActionRail.tsx` (`RailAction.dot` 추가)
- Test: `components/deal-room/__tests__/DealRoomActionRail.test.tsx` (없으면 생성)

**Interfaces:**
- Consumes: `ChipColor` (기존)
- Produces:
  - `export const TONE_COLOR_VAR: Record<ChipColor, string>` — CSS 변수 문자열(`'var(--md-sys-color-primary)'` 등)
  - `RailAction` 에 `dot?: ChipColor` 필드

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`components/deal-room/__tests__/DealRoomActionRail.test.tsx` (파일이 이미 있으면 `describe` 블록만 추가):

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { DealRoomActionRail } from '../DealRoomActionRail';

afterEach(cleanup);

describe('DealRoomActionRail', () => {
  it('dot 이 있으면 상태 점을 그린다', () => {
    render(
      <DealRoomActionRail
        actions={[
          { id: 'contract', label: '계약', icon: <span />, onSelect: vi.fn(), dot: 'warning' },
          { id: 'compare', label: '견적 비교', icon: <span />, onSelect: vi.fn() },
        ]}
      />,
    );
    const dots = screen.getAllByTestId('rail-dot');
    expect(dots).toHaveLength(1);
    // jsdom 은 CSS 변수 값을 계산하지 않으므로 style 속성 문자열로 검증한다.
    expect(dots[0].getAttribute('style')).toContain('--md-sys-color-warning');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm test components/deal-room/__tests__/DealRoomActionRail.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="rail-dot"]` (그리고 `dot` 속성 타입 에러)

- [ ] **Step 3: 최소 구현을 작성한다**

`components/primitives/Chip.tsx` — 파일 끝에 추가:

```ts
/**
 * Chip 과 같은 색 어휘를 쓰는 비-Chip 표식(레일 도트·타임라인 마크)용 raw CSS 변수.
 * tonalClasses 는 컨테이너 배경색이라 점·선에는 진한 축이 필요하다.
 */
export const TONE_COLOR_VAR: Record<ChipColor, string> = {
  primary: 'var(--md-sys-color-primary)',
  tertiary: 'var(--md-sys-color-tertiary)',
  warning: 'var(--md-sys-color-warning)',
  error: 'var(--md-sys-color-error)',
  surface: 'var(--md-sys-color-outline)',
};
```

`components/deal-room/DealRoomActionRail.tsx`:

```tsx
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { TONE_COLOR_VAR, type ChipColor } from '@/components/primitives/Chip';

export type RailAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** 위험 작업(취소·철회) — hover 시 error 색. */
  danger?: boolean;
  /** 주요 작업(선정·작성) — primary 색. */
  primary?: boolean;
  disabled?: boolean;
  /** 상태 표식 — 아이콘 우상단 점(전자서명 진행 상태 등). */
  dot?: ChipColor;
};
```

같은 파일의 `<button>` 안, `{a.icon}` 바로 앞에 추가:

```tsx
          {a.dot && (
            <span
              data-testid="rail-dot"
              aria-hidden
              className="absolute top-[7px] right-[16px] size-[7px] rounded-full ring-2 ring-[var(--md-sys-color-surface)] max-lg:right-[8px]"
              style={{ background: TONE_COLOR_VAR[a.dot] }}
            />
          )}
```

그리고 같은 `<button>`의 `className` 첫 문자열에 `relative` 를 더한다:

```tsx
            'relative mx-1 flex flex-col items-center gap-1.5 rounded-[var(--md-sys-shape-small)] px-1 py-2.5 text-[11px] tracking-[-0.01em] transition-colors max-lg:mx-0 max-lg:shrink-0 max-lg:px-3',
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm test components/deal-room/__tests__/DealRoomActionRail.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add components/primitives/Chip.tsx components/deal-room/DealRoomActionRail.tsx components/deal-room/__tests__/DealRoomActionRail.test.tsx
git commit -m "feat(deal-room): 레일 액션 상태 도트 + 톤 색 변수 SSOT"
```

---

### Task 3: 세로 서명 타임라인 `SigningTimeline.tsx`

노드 배열을 받아 그리기만 하는 표시 전용 컴포넌트. 상태·핸들러 없음.

**Files:**
- Create: `components/deal-room/signing/SigningTimeline.tsx`
- Test: `components/deal-room/signing/__tests__/SigningTimeline.test.tsx`

**Interfaces:**
- Consumes: `SigningNode` (Task 1), `TONE_COLOR_VAR` (Task 2), `Chip`, `LocalTime`
- Produces: `export function SigningTimeline({ nodes }: { nodes: SigningNode[] })`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`components/deal-room/signing/__tests__/SigningTimeline.test.tsx`:

```tsx
import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { SigningTimeline } from '../SigningTimeline';
import type { SigningNode } from '../signing-view-model';

afterEach(cleanup);

const nodes: SigningNode[] = [
  { key: 'sent', kind: 'milestone', label: '서명 요청을 보냈어요', state: 'done', at: '2026-07-20T05:02:00Z' },
  {
    key: 'p1',
    kind: 'person',
    label: '김구매',
    detail: '구매사',
    sub: 'buyer@x.com · 휴대폰 간편인증',
    state: 'done',
    chip: { color: 'tertiary', label: '서명 완료' },
    at: '2026-07-20T06:10:00Z',
    initial: '김',
  },
  {
    key: 'p2',
    kind: 'person',
    label: '이대행',
    detail: 'PG',
    sub: 'pg@x.com · 이메일 인증',
    state: 'pending',
    chip: { color: 'surface', label: '서명 대기' },
    initial: '이',
  },
  { key: 'done', kind: 'milestone', label: '계약 완료', state: 'pending' },
];

describe('SigningTimeline', () => {
  it('노드를 순서대로 그리고 사람 노드에 이니셜·역할·칩을 붙인다', () => {
    render(<SigningTimeline nodes={nodes} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('서명 요청을 보냈어요');
    expect(items[1]).toHaveTextContent('김구매');
    expect(items[1]).toHaveTextContent('구매사');
    expect(items[1]).toHaveTextContent('서명 완료');
    expect(screen.getByText('김')).toBeInTheDocument();
    expect(items[3]).toHaveTextContent('계약 완료');
  });

  it('마일스톤의 설명(detail)도 노출한다', () => {
    render(
      <SigningTimeline
        nodes={[
          { key: 'prepare', kind: 'milestone', label: '계약서 준비', detail: 'PG사가 계약서를 등록하는 단계예요', state: 'active' },
        ]}
      />,
    );
    expect(screen.getByText('PG사가 계약서를 등록하는 단계예요')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm test components/deal-room/signing/__tests__/SigningTimeline.test.tsx`
Expected: FAIL — `Failed to resolve import "../SigningTimeline"`

- [ ] **Step 3: 최소 구현을 작성한다**

`components/deal-room/signing/SigningTimeline.tsx`:

```tsx
'use client';

/**
 * SigningTimeline — 세로 서명 타임라인(표시 전용).
 *
 * 노드는 항상 `시작 → 사람/단계 → 사람/단계 → 종결` 4개. 마일스톤은 10px 점,
 * 사람은 28px 이니셜 디스크로 그려 "사람이 본체"라는 위계를 크기로 드러낸다.
 * 완료 구간의 연결선은 실선, 대기 구간은 점선.
 */
import { Chip } from '@/components/primitives/Chip';
import { LocalTime } from '@/components/primitives/LocalTime';
import type { SigningNode } from './signing-view-model';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

const discClass: Record<SigningNode['state'], string> = {
  done: 'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]',
  active:
    'text-[var(--md-sys-color-on-surface-variant)] shadow-[inset_0_0_0_1.5px_var(--md-sys-color-primary)]',
  pending:
    'text-[var(--md-sys-color-on-surface-variant)] shadow-[inset_0_0_0_1.5px_var(--md-sys-color-outline)]',
  failed: 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]',
};

const markClass: Record<SigningNode['state'], string> = {
  done: 'bg-[var(--md-sys-color-tertiary)]',
  active: 'bg-[var(--md-sys-color-warning)]',
  pending: 'shadow-[inset_0_0_0_1.5px_var(--md-sys-color-outline)]',
  failed: 'bg-[var(--md-sys-color-error)]',
};

export function SigningTimeline({ nodes }: { nodes: SigningNode[] }) {
  return (
    <ol className="px-4 pt-1.5 pb-2.5">
      {nodes.map((n, i) => {
        const last = i === nodes.length - 1;
        const connected = n.state === 'done';
        return (
          <li key={n.key} className="flex min-h-[38px] gap-3">
            <div className="flex w-7 flex-none flex-col items-center">
              {n.kind === 'person' ? (
                <span
                  aria-hidden
                  className={
                    'mt-0.5 grid size-7 flex-none place-items-center rounded-full text-[11.5px] font-semibold ' +
                    discClass[n.state]
                  }
                >
                  {n.initial}
                </span>
              ) : (
                <span
                  aria-hidden
                  className={'mt-[9px] size-2.5 flex-none rounded-full ' + markClass[n.state]}
                />
              )}
              {!last && (
                <span
                  aria-hidden
                  className={
                    'my-[3px] w-0 flex-1 border-l-[1.5px] ' +
                    (connected
                      ? 'border-solid border-[var(--md-sys-color-tertiary)]'
                      : 'border-dotted border-[var(--md-sys-color-outline)]')
                  }
                />
              )}
            </div>
            <div className="flex flex-1 items-start gap-2.5 pt-1.5 pb-2.5">
              <div className="min-w-0 flex-1">
                <div
                  className={
                    'text-[13px] ' +
                    (n.kind === 'person' || n.state !== 'pending'
                      ? 'font-medium'
                      : 'font-normal ' + dim)
                  }
                >
                  {n.label}
                  {n.kind === 'person' && n.detail && (
                    <span className={'font-normal ' + dim}> · {n.detail}</span>
                  )}
                </div>
                {n.kind === 'milestone' && n.detail && (
                  <div className={'mt-px text-[12px] ' + dim}>{n.detail}</div>
                )}
                {n.sub && <div className={'mt-px truncate text-[12px] ' + dim}>{n.sub}</div>}
              </div>
              <div className="flex flex-none flex-col items-end gap-1">
                {n.chip && <Chip color={n.chip.color} label={n.chip.label} />}
                {n.at && (
                  <span className={'md-numeric text-[11.5px] ' + dim}>
                    <LocalTime iso={n.at} format="MM-dd HH:mm" />
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm test components/deal-room/signing/__tests__/SigningTimeline.test.tsx`
Expected: PASS — 2 tests

- [ ] **Step 5: 커밋한다**

```bash
git add components/deal-room/signing/
git commit -m "feat(signing): 세로 서명 타임라인 컴포넌트"
```

---

### Task 4: 카드 셸 `SigningTab.tsx` — `SigningPanel` 대체

3구역 셸(헤더 · 타임라인 · 액션 바) + 서버 액션 실행 + 완료본 다운로드. 기존 `SigningPanel`을 삭제하고 두 body의 임포트만 갈아끼운다(배치 변경은 Task 6·7).

**Files:**
- Create: `components/deal-room/signing/SigningTab.tsx`
- Test: `components/deal-room/signing/__tests__/SigningTab.test.tsx`
- Modify: `components/deal-room/buyer/BuyerDealRoomBody.tsx` (임포트·사용처 1곳)
- Modify: `components/deal-room/pg/PgDealRoomBody.tsx` (임포트·사용처 1곳)
- Delete: `components/deal-room/SigningPanel.tsx`, `components/deal-room/__tests__/SigningPanel.test.tsx`

**Interfaces:**
- Consumes: `buildSigningCardView` (Task 1), `SigningTimeline` (Task 3), 기존 서버 액션 3종, `signingErrorMessage`
- Produces: `export function SigningTab({ rfpCode, signing, side }: { rfpCode: string; signing: SigningView; side: SigningSide })`
  - `signing`은 **non-nullable** — 호출부가 `signing && <SigningTab …/>`로 걸러 넘긴다(구 `SigningPanel`의 self-hide 제거).

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`components/deal-room/signing/__tests__/SigningTab.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/server/actions/signing/remindSigningAction', () => ({
  remindSigningAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/server/actions/signing/cancelSigningAction', () => ({
  cancelSigningAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/server/actions/signing/resendSigningAction', () => ({
  resendSigningAction: vi.fn(async () => ({ ok: false, error: 'CONTRACT_BUSY' })),
}));

import { SigningTab } from '../SigningTab';
import { toast } from '@/lib/toast';
import { remindSigningAction } from '@/lib/server/actions/signing/remindSigningAction';
import { resendSigningAction } from '@/lib/server/actions/signing/resendSigningAction';
import type {
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantRole,
  SigningParticipantStatus,
  SigningView,
} from '@/lib/types/signing';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function part(
  role: SigningParticipantRole,
  status: SigningParticipantStatus,
  over: Partial<SigningParticipant> = {},
): SigningParticipant {
  return {
    id: role,
    contractId: 'c1',
    name: role === 'buyer' ? '김구매' : '이대행',
    email: `${role}@x.com`,
    role,
    securityMethod: 'easy_cert',
    status,
    ...over,
  };
}

function view(status: SigningContractStatus, participants: SigningParticipant[] = []): SigningView {
  return {
    contract: {
      id: 'c1',
      rfpId: 'r1',
      status,
      round: 1,
      createdBy: 'u',
      createdAt: '2026-07-20T04:40:00Z',
      sentAt: '2026-07-20T05:02:00Z',
      ...(status === 'completed' ? { completedAt: '2026-07-21T01:24:00Z' } : {}),
    },
    participants,
  };
}

describe('SigningTab', () => {
  it('awaiting_pg_template — 구매사는 대기 안내를 본다', () => {
    render(<SigningTab rfpCode="P-2607-0001" signing={view('awaiting_pg_template')} side="buyer" />);
    expect(screen.getByText('PG사가 계약서를 준비하고 있어요')).toBeInTheDocument();
    expect(screen.getByText('계약서 준비 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '서명 템플릿 등록하기' })).not.toBeInTheDocument();
  });

  it('awaiting_pg_template — PG는 템플릿 등록 화면으로 갈 수 있다', async () => {
    const user = userEvent.setup();
    render(<SigningTab rfpCode="P-2607-0001" signing={view('awaiting_pg_template')} side="pg" />);
    expect(screen.getByText('계약서 템플릿을 등록해 주세요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '서명 템플릿 등록하기' }));
    expect(nav.push).toHaveBeenCalledWith('/signing-templates');
  });

  it('in_progress — 참여자 타임라인 + 리마인더 발신', async () => {
    const user = userEvent.setup();
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('in_progress', [part('buyer', 'signed'), part('pg', 'pending')])}
        side="buyer"
      />,
    );
    expect(screen.getByText(/김구매/)).toBeInTheDocument();
    expect(screen.getByText(/이대행/)).toBeInTheDocument();
    expect(screen.getByText('서명 대기')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '리마인더 보내기' }));
    expect(remindSigningAction).toHaveBeenCalledWith({ contractId: 'c1' });
  });

  it('completed — 완료 안내 + 문서 다운로드 링크', () => {
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('completed', [part('buyer', 'signed'), part('pg', 'signed')])}
        side="buyer"
      />,
    );
    expect(screen.getByText('모든 서명이 완료됐어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /계약서/ })).toHaveAttribute(
      'href',
      '/api/signing/c1/document',
    );
    expect(screen.getByRole('link', { name: /감사추적인증서/ })).toHaveAttribute(
      'href',
      '/api/signing/c1/audit',
    );
  });

  it('declined — 다시 발송 실패 시 친절한 문구로 알린다', async () => {
    const user = userEvent.setup();
    render(
      <SigningTab
        rfpCode="P-2607-0001"
        signing={view('declined', [part('buyer', 'signed'), part('pg', 'rejected')])}
        side="buyer"
      />,
    );
    expect(screen.getByText('서명이 거절됐어요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 발송' }));
    expect(resendSigningAction).toHaveBeenCalledWith({ rfpCode: 'P-2607-0001' });
    expect(toast).toHaveBeenCalledWith('다른 작업이 처리 중이에요. 잠시 후 다시 시도해 주세요.', {
      type: 'error',
    });
  });

  it('send_failed — 다시 시작 버튼을 노출한다', () => {
    render(<SigningTab rfpCode="P-2607-0001" signing={view('send_failed')} side="pg" />);
    expect(screen.getByText('전자서명을 시작하지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시작' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm test components/deal-room/signing/__tests__/SigningTab.test.tsx`
Expected: FAIL — `Failed to resolve import "../SigningTab"`

- [ ] **Step 3: 최소 구현을 작성한다**

`components/deal-room/signing/SigningTab.tsx`:

```tsx
'use client';

/**
 * SigningTab — 딜룸 '계약' 탭 본문(buyer·PG 공통).
 *
 * 상태 파생은 signing-view-model 이 전담하고 여기선 세 구역(헤더 · 타임라인 ·
 * 액션 바)을 고정 순서로 그리고 액션을 실행한다. ACL 은 서버 액션에서 재검증하므로
 * 표시·발신만 담당한다. 완료본 다운로드는 302 프록시 링크(로컬 보관 없음).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  FileSignature,
  FileText,
  XCircle,
} from 'lucide-react';

import { Chip } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { signingErrorMessage } from '@/lib/signing/error-messages';
import { remindSigningAction } from '@/lib/server/actions/signing/remindSigningAction';
import { cancelSigningAction } from '@/lib/server/actions/signing/cancelSigningAction';
import { resendSigningAction } from '@/lib/server/actions/signing/resendSigningAction';
import type { SigningView } from '@/lib/types/signing';
import { SigningTimeline } from './SigningTimeline';
import {
  buildSigningCardView,
  type SigningAction,
  type SigningIcon,
  type SigningSide,
} from './signing-view-model';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

const ICONS: Record<SigningIcon, typeof Clock> = {
  clock: Clock,
  alert: AlertTriangle,
  pen: FileSignature,
  check: CheckCircle2,
  x: XCircle,
  slash: Ban,
};

const TONE_TEXT = {
  primary: 'text-[var(--md-sys-color-primary)]',
  tertiary: 'text-[var(--md-sys-color-tertiary)]',
  warning: 'text-[var(--md-sys-color-warning)]',
  error: 'text-[var(--md-sys-color-error)]',
  surface: 'text-[var(--md-sys-color-on-surface-variant)]',
} as const;

export function SigningTab({
  rfpCode,
  signing,
  side,
}: {
  rfpCode: string;
  signing: SigningView;
  side: SigningSide;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { contract } = signing;
  const v = buildSigningCardView(signing, side);
  const Icon = ICONS[v.icon];

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
    failMsg: string,
  ) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      toast(signingErrorMessage(r.error, failMsg), { type: 'error' });
      return;
    }
    toast(okMsg, { type: 'success' });
    router.refresh();
  }

  function onAction(a: SigningAction) {
    switch (a.id) {
      case 'template':
        router.push('/signing-templates');
        return;
      case 'remind':
        void run(
          () => remindSigningAction({ contractId: contract.id }),
          '리마인더를 보냈어요',
          '리마인더를 보내지 못했어요',
        );
        return;
      case 'cancel':
        setCancelOpen(true);
        return;
      case 'resend':
        void run(
          () => resendSigningAction({ rfpCode }),
          '다시 발송했어요',
          '다시 발송하지 못했어요',
        );
        return;
    }
  }

  return (
    <section className="rounded-[10px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)]">
      <header className="flex items-start gap-2.5 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
        <Icon className={'mt-px size-[18px] shrink-0 ' + TONE_TEXT[v.tone]} aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-semibold">{v.title}</h3>
          <p className={'mt-0.5 text-[12.5px] ' + dim}>{v.description}</p>
        </div>
        <Chip color={v.chip.color} label={v.chip.label} />
      </header>

      <SigningTimeline nodes={v.nodes} />

      {v.docs.length > 0 && (
        <div className="px-4 pt-1 pb-3.5">
          {v.docs.map((d) => (
            <a
              key={d.id}
              href={`/api/signing/${contract.id}/${d.id}`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] py-2.5 last:border-b-0 hover:opacity-80"
            >
              <span className="grid size-[30px] shrink-0 place-items-center rounded-md bg-[var(--md-sys-color-surface-container)]">
                <FileText className={'size-[15px] ' + dim} strokeWidth={1.7} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{d.title}</span>
                <span className={'block text-[12px] ' + dim}>{d.caption}</span>
              </span>
              <Download className={'size-[15px] shrink-0 ' + dim} aria-hidden />
            </a>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-2.5">
        <span className={'min-w-0 flex-1 text-[12px] ' + dim}>{v.note}</span>
        {v.actions.map((a) => (
          <Button
            key={a.id}
            variant={a.variant}
            size="sm"
            color={a.danger ? 'error' : 'primary'}
            disabled={busy}
            onClick={() => onAction(a)}
          >
            {a.label}
          </Button>
        ))}
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={(o) => !busy && setCancelOpen(o)}
        title="전자서명을 취소할까요?"
        description="취소하면 진행 중인 서명이 중단돼요. 필요하면 나중에 다시 발송할 수 있어요."
        confirmLabel="취소"
        variant="danger"
        loading={busy}
        onConfirm={async () => {
          await run(
            () => cancelSigningAction({ contractId: contract.id }),
            '전자서명을 취소했어요',
            '취소하지 못했어요',
          );
          setCancelOpen(false);
        }}
      />
    </section>
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm test components/deal-room/signing/__tests__/SigningTab.test.tsx`
Expected: PASS — 6 tests

- [ ] **Step 5: 구 `SigningPanel`을 걷어낸다**

`components/deal-room/buyer/BuyerDealRoomBody.tsx` — 임포트 교체:

```tsx
import { SigningTab } from '@/components/deal-room/signing/SigningTab';
```

같은 파일의 사용처(`{signing && (…)}` 블록) 안:

```tsx
              <SigningTab rfpCode={rfp.code} signing={signing} side="buyer" />
```

`components/deal-room/pg/PgDealRoomBody.tsx` — 임포트 교체:

```tsx
import { SigningTab } from '@/components/deal-room/signing/SigningTab';
```

같은 파일의 사용처:

```tsx
        {signing && <SigningTab rfpCode={rfp.code} signing={signing} side="pg" />}
```

파일 2개 삭제:

```bash
rm components/deal-room/SigningPanel.tsx components/deal-room/__tests__/SigningPanel.test.tsx
```

- [ ] **Step 6: 딜룸 회귀가 없는지 확인한다**

Run: `pnpm test components/deal-room`
Expected: PASS — `SigningPanel.test.tsx`는 사라지고 나머지 전부 green

- [ ] **Step 7: 커밋한다**

```bash
git add -A components/deal-room
git commit -m "feat(signing): SigningPanel → SigningTab 3구역 셸로 교체"
```

---

### Task 5: 요약 스트립 + 선정 컨텍스트 한 줄

계약 탭 밖에서 상태를 알리는 38px 한 줄(`SigningSummaryStrip`)과, 계약 탭 상단에서 결과 헤더를 대신하는 한 줄(`AwardContextLine`).

**Files:**
- Create: `lib/hooks/useStartConversation.ts`
- Create: `components/deal-room/signing/SigningSummaryStrip.tsx`
- Create: `components/deal-room/signing/AwardContextLine.tsx`
- Modify: `components/rfp/comparison/AwardResult.tsx` (자체 `startMessage` → 공용 훅)
- Test: `components/deal-room/signing/__tests__/SigningSummaryStrip.test.tsx`
- Test: `components/deal-room/signing/__tests__/AwardContextLine.test.tsx`

**Interfaces:**
- Consumes: `buildSigningSummary` (Task 1), `TONE_COLOR_VAR` (Task 2), `getOrCreateConversationAction` (기존)
- Produces:
  - `export function useStartConversation(): { starting: boolean; start: (counterpartyWsId: string) => Promise<void> }`
  - `export function SigningSummaryStrip({ signing, side, onOpen }: { signing: SigningView; side: SigningSide; onOpen: () => void })`
  - `export function AwardContextLine({ workspaceName, contactName, counterpartyWsId }: { workspaceName: string; contactName?: string; counterpartyWsId?: string })`

> **계획 수정(2026-07-21)**: 메시지 시작 로직은 `AwardResult.tsx`의 `startMessage`와 같은 코드다. 새로 복제하지 말고 `lib/hooks/useStartConversation.ts` 공용 훅으로 뽑아 **두 곳이 함께 쓴다**. `AwardResult`의 동작(성공 시 `/messages?c=<id>`, 실패·throw 시 `/messages`, `starting` 동안 버튼 비활성)은 그대로 유지되어야 하며 기존 `AwardResult.test.tsx`가 green 이어야 한다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`components/deal-room/signing/__tests__/SigningSummaryStrip.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SigningSummaryStrip } from '../SigningSummaryStrip';
import type { SigningView } from '@/lib/types/signing';

afterEach(cleanup);

const inProgress: SigningView = {
  contract: {
    id: 'c1',
    rfpId: 'r1',
    status: 'in_progress',
    round: 1,
    createdBy: 'u',
    createdAt: '2026-07-20T04:40:00Z',
  },
  participants: [
    { id: 'b', contractId: 'c1', name: '김구매', email: 'b@x.com', role: 'buyer', securityMethod: 'easy_cert', status: 'signed' },
    { id: 'p', contractId: 'c1', name: '이대행', email: 'p@x.com', role: 'pg', securityMethod: 'email', status: 'pending' },
  ],
};

describe('SigningSummaryStrip', () => {
  it('상태와 서명 수를 보여주고 클릭하면 열림을 알린다', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<SigningSummaryStrip signing={inProgress} side="buyer" onOpen={onOpen} />);
    const strip = screen.getByRole('button', { name: /전자서명/ });
    expect(strip).toHaveTextContent('서명 진행 중');
    expect(strip).toHaveTextContent('1');
    expect(strip).toHaveTextContent('2');
    await user.click(strip);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('진행 중이 아니면 개수를 쓰지 않는다', () => {
    render(
      <SigningSummaryStrip
        signing={{ ...inProgress, contract: { ...inProgress.contract, status: 'completed' } }}
        side="buyer"
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /전자서명/ })).toHaveTextContent('서명 완료');
  });
});
```

`components/deal-room/signing/__tests__/AwardContextLine.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/lib/server/actions/chat/getOrCreateConversationAction', () => ({
  getOrCreateConversationAction: vi.fn(async () => ({ ok: true, conversationId: 'conv-1' })),
}));

import { AwardContextLine } from '../AwardContextLine';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AwardContextLine', () => {
  it('선정 상대와 담당자를 한 줄로 보여준다', () => {
    render(<AwardContextLine workspaceName="나이스페이먼츠" contactName="김민수" />);
    expect(screen.getByText('나이스페이먼츠')).toBeInTheDocument();
    expect(screen.getByText(/김민수/)).toBeInTheDocument();
  });

  it('상대 워크스페이스가 있으면 메시지로 이동한다', async () => {
    const user = userEvent.setup();
    render(
      <AwardContextLine
        workspaceName="나이스페이먼츠"
        contactName="김민수"
        counterpartyWsId="11111111-1111-1111-1111-111111111111"
      />,
    );
    await user.click(screen.getByRole('button', { name: '메시지' }));
    expect(nav.push).toHaveBeenCalledWith('/messages?c=conv-1');
  });

  it('상대 워크스페이스가 없으면 메시지 버튼을 그리지 않는다', () => {
    render(<AwardContextLine workspaceName="나이스페이먼츠" />);
    expect(screen.queryByRole('button', { name: '메시지' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm test components/deal-room/signing/__tests__/SigningSummaryStrip.test.tsx components/deal-room/signing/__tests__/AwardContextLine.test.tsx`
Expected: FAIL — 두 모듈 모두 `Failed to resolve import`

- [ ] **Step 3: 최소 구현을 작성한다**

`components/deal-room/signing/SigningSummaryStrip.tsx`:

```tsx
'use client';

/**
 * SigningSummaryStrip — 계약 탭 밖(견적 비교·견적 작성)에 남는 38px 한 줄.
 * 다른 탭에 머무는 동안에도 서명 상태 변화를 놓치지 않게 한다. 클릭하면 계약 탭으로.
 */
import { ChevronRight, FileSignature } from 'lucide-react';

import { TONE_COLOR_VAR } from '@/components/primitives/Chip';
import type { SigningView } from '@/lib/types/signing';
import { buildSigningSummary, type SigningSide } from './signing-view-model';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

export function SigningSummaryStrip({
  signing,
  side,
  onOpen,
}: {
  signing: SigningView;
  side: SigningSide;
  onOpen: () => void;
}) {
  const s = buildSigningSummary(signing, side);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-4 flex h-[38px] w-full items-center gap-2.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-3 text-left text-[12.5px] transition-colors hover:bg-[var(--md-sys-color-surface-container-low)]"
    >
      <FileSignature className={'size-[15px] shrink-0 ' + dim} aria-hidden />
      <span className="font-medium">전자서명</span>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: TONE_COLOR_VAR[s.dot] }}
      />
      <span className={'min-w-0 truncate ' + dim}>
        {s.label}
        {s.total !== undefined && (
          <>
            {' · '}
            <span className="md-numeric">{s.signed}</span>/
            <span className="md-numeric">{s.total}</span>
          </>
        )}
      </span>
      <span className={'ml-auto flex shrink-0 items-center gap-0.5 text-[12px] ' + dim}>
        보기
        <ChevronRight className="size-[13px]" aria-hidden />
      </span>
    </button>
  );
}
```

`lib/hooks/useStartConversation.ts` — 기존 `AwardResult.startMessage` 를 그대로 옮긴다:

```ts
'use client';

/**
 * 상대 워크스페이스와의 대화를 보장하고 메시지로 이동한다. 선정 결과 화면
 * (AwardResult)과 계약 탭 컨텍스트 줄(AwardContextLine)이 공유한다.
 * 실패·throw 시에도 사용자를 LOADING… 에 가두지 않고 메시지 목록으로 보낸다.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { getOrCreateConversationAction } from '@/lib/server/actions/chat/getOrCreateConversationAction';

export function useStartConversation() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const start = async (counterpartyWsId: string) => {
    if (starting) return;
    setStarting(true);
    try {
      const r = await getOrCreateConversationAction(counterpartyWsId);
      if (r.ok) {
        router.push(`/messages?c=${r.conversationId}`);
        return;
      }
    } catch {
      // 액션이 throw 해도 사용자를 LOADING… 에 가두지 않는다.
    }
    setStarting(false);
    router.push('/messages');
  };

  return { starting, start };
}
```

`components/rfp/comparison/AwardResult.tsx` — 자체 `startMessage`·`starting` state·관련 임포트를 지우고 훅을 쓴다:

```tsx
import { useStartConversation } from '@/lib/hooks/useStartConversation';

// …컴포넌트 안에서
  const { starting, start } = useStartConversation();
```

기존 `onClick={startMessage}` 는 `onClick={() => start(pgWsId)}` 로 바꾼다. `starting` 을 쓰던 버튼 라벨·disabled 는 그대로 둔다.

`components/deal-room/signing/AwardContextLine.tsx`:

```tsx
'use client';

/**
 * AwardContextLine — 계약 탭 상단 한 줄(선정 상대 · 담당자 · 메시지).
 *
 * 계약 탭이 기본으로 열리면서 DealResultHeader 가 뒤 탭으로 밀리므로, 최소한의
 * 맥락만 여기 남긴다. 전화·이메일까지 담은 전체 ContactBlock 은 결과 탭에 그대로 있다.
 * 박스를 두르지 않아 카드가 하나 더 늘어난 것처럼 보이지 않게 한다.
 */
import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/primitives/Button';
import { useStartConversation } from '@/lib/hooks/useStartConversation';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

export function AwardContextLine({
  workspaceName,
  contactName,
  counterpartyWsId,
}: {
  workspaceName: string;
  contactName?: string;
  counterpartyWsId?: string;
}) {
  const { starting, start } = useStartConversation();

  return (
    <div className={'mb-3.5 flex items-center gap-2 text-[13px] ' + dim}>
      <CheckCircle2
        className="size-[17px] shrink-0 text-[var(--md-sys-color-tertiary)]"
        aria-hidden
      />
      <span className="truncate font-semibold text-[var(--md-sys-color-on-surface)]">
        {workspaceName}
      </span>
      <span className="shrink-0">· 선정 완료</span>
      {contactName && <span className="truncate">· 담당자 {contactName}</span>}
      {counterpartyWsId && (
        <span className="ml-auto shrink-0">
          <Button
            variant="outlined"
            size="sm"
            disabled={starting}
            onClick={() => start(counterpartyWsId)}
          >
            메시지
          </Button>
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm test components/deal-room/signing components/rfp/comparison/AwardResult.test.tsx`
Expected: PASS — 신규 4개 스위트 + 기존 `AwardResult` 스위트 전부 green(훅 추출 후에도 선정 결과 화면 동작 불변)

- [ ] **Step 5: 커밋한다**

```bash
git add lib/hooks/useStartConversation.ts components/deal-room/signing/ components/rfp/comparison/AwardResult.tsx
git commit -m "feat(signing): 요약 스트립 + 선정 컨텍스트 한 줄 (대화 시작 훅 공용화)"
```

---

### Task 6: 구매사 딜룸 탭 재구성

'계약' 탭을 맨 앞에 넣고 기본 활성으로 만든다. 견적 비교 탭에는 요약 스트립만 남긴다.

**Files:**
- Modify: `components/deal-room/buyer/BuyerDealRoomBody.tsx`
- Test: `components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx`

**Interfaces:**
- Consumes: `SigningTab` (Task 4), `SigningSummaryStrip` / `AwardContextLine` (Task 5), `RailAction.dot` (Task 2)
- Produces: 없음(화면 조립)

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx` — 파일 상단 mock 블록에 다음을 추가한다(다른 mock 들과 같은 위치, `import` 문 앞):

```tsx
vi.mock('@/components/deal-room/signing/SigningTab', () => ({
  SigningTab: () => <div data-testid="signing-tab" />,
}));
vi.mock('@/components/deal-room/signing/AwardContextLine', () => ({
  AwardContextLine: () => <div data-testid="award-context" />,
}));
```

파일 끝에 `describe` 블록을 추가한다. 이 파일에 이미 있는 `buildData(over?)` 픽스처와 `render`(= `DealRoomProvider` 래퍼) 를 그대로 쓴다. `userEvent` 임포트가 없으므로 파일 상단에 `import userEvent from '@testing-library/user-event';` 를 추가한다:

```tsx
import type { SigningView } from '@/lib/types/signing';

function signingView(): SigningView {
  return {
    contract: {
      id: 'c1',
      rfpId: 'r1',
      status: 'in_progress',
      round: 1,
      createdBy: 'u',
      createdAt: '2026-07-20T04:40:00Z',
    },
    participants: [],
  };
}

describe('BuyerDealRoomBody — 계약 탭', () => {
  it('signing 이 없으면 계약 탭이 없고 견적 비교가 기본이다', () => {
    render(<BuyerDealRoomBody data={buildData()} />);
    expect(screen.queryByRole('tab', { name: /계약/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '견적 비교' })).toHaveAttribute('aria-selected', 'true');
  });

  it('signing 이 있으면 계약 탭이 첫 번째이고 기본으로 열린다', () => {
    render(<BuyerDealRoomBody data={buildData({ signing: signingView() })} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('계약');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('signing-tab')).toBeInTheDocument();
  });

  it('견적 비교 탭의 요약 스트립을 누르면 계약 탭으로 간다', async () => {
    const user = userEvent.setup();
    render(<BuyerDealRoomBody data={buildData({ signing: signingView() })} />);
    await user.click(screen.getByRole('tab', { name: '견적 비교' }));
    await user.click(screen.getByRole('button', { name: /전자서명/ }));
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('signing-tab')).toBeInTheDocument();
  });
});
```

> 기존 케이스들은 `buildData()` 기본값이 `signing: null` 이라 계약 탭 없이 견적 비교가 기본으로 남는다 — 회귀하지 않는다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm test components/deal-room/buyer/__tests__/BuyerDealRoomBody.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "tab" and name /계약/`

- [ ] **Step 3: 최소 구현을 작성한다**

`components/deal-room/buyer/BuyerDealRoomBody.tsx`:

임포트 교체·추가:

```tsx
import { SigningTab } from '@/components/deal-room/signing/SigningTab';
import { SigningSummaryStrip } from '@/components/deal-room/signing/SigningSummaryStrip';
import { AwardContextLine } from '@/components/deal-room/signing/AwardContextLine';
import { buildSigningSummary } from '@/components/deal-room/signing/signing-view-model';
import { FileSignature } from 'lucide-react';
```

기본 탭 상태(`const [tab, setTab] = useState('compare');`)를 교체:

```tsx
  const [tab, setTab] = useState(signing ? 'contract' : 'compare');
```

선정 PG 워크스페이스 id(메시지 CTA용)를 파생 — `focusedBid` 선언 아래에 추가:

```tsx
  const awardedPgWsId = rfp.awardedBidId
    ? bids.find((b) => b.id === rfp.awardedBidId)?.pgWsId
    : undefined;
```

`compare` 탭 content 에서 `SigningTab` 블록을 스트립으로 교체(결과 헤더는 그대로 둔다):

```tsx
          {signing && (
            <SigningSummaryStrip signing={signing} side="buyer" onOpen={() => setTab('contract')} />
          )}
```

`tabs` 배열 맨 앞에 계약 탭을 조건부로 넣는다 — 배열 리터럴을 다음으로 감싼다:

```tsx
  const tabs: DealRoomTab[] = [
    ...(signing
      ? [
          {
            id: 'contract',
            label: '계약',
            content: (
              <>
                {awardedPgContact && (
                  <AwardContextLine
                    workspaceName={awardedPgContact.workspaceName}
                    contactName={awardedPgContact.name}
                    counterpartyWsId={awardedPgWsId}
                  />
                )}
                <SigningTab rfpCode={rfp.code} signing={signing} side="buyer" />
              </>
            ),
          } satisfies DealRoomTab,
        ]
      : []),
    {
      id: 'compare',
      label: '견적 비교',
      // …기존 내용 그대로…
```

레일 액션 배열 맨 앞에 계약을 조건부로 넣는다:

```tsx
  const actions: RailAction[] = [
    ...(signing
      ? [
          {
            id: 'contract',
            label: '계약',
            icon: <FileSignature />,
            dot: buildSigningSummary(signing, 'buyer').dot,
            onSelect: () => setTab('contract'),
          } satisfies RailAction,
        ]
      : []),
    {
      id: 'award',
      // …기존 내용 그대로…
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm test components/deal-room/buyer`
Expected: PASS — 신규 3 케이스 + 기존 케이스 전부 green

- [ ] **Step 5: 커밋한다**

```bash
git add components/deal-room/buyer/
git commit -m "feat(deal-room): 구매사 딜룸 계약 탭 신설(맨 앞·기본 활성)"
```

---

### Task 7: PG 딜룸 탭 재구성

구매사와 같은 규칙. PG는 `awardedToMe`일 때만 `signing`이 내려오므로 조건이 자동으로 좁혀진다.

**Files:**
- Modify: `components/deal-room/pg/PgDealRoomBody.tsx`
- Test: `components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx`

**Interfaces:**
- Consumes: Task 4·5·2 산출물 (구매사와 동일)
- Produces: 없음(화면 조립)

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx` — mock 블록에 추가:

```tsx
vi.mock('@/components/deal-room/signing/SigningTab', () => ({
  SigningTab: () => <div data-testid="signing-tab" />,
}));
vi.mock('@/components/deal-room/signing/AwardContextLine', () => ({
  AwardContextLine: () => <div data-testid="award-context" />,
}));
```

파일 끝에 추가:

```tsx
import type { SigningView } from '@/lib/types/signing';

function signingView(): SigningView {
  return {
    contract: {
      id: 'c1',
      rfpId: 'r1',
      status: 'awaiting_pg_template',
      round: 1,
      createdBy: 'u',
      createdAt: '2026-07-20T04:40:00Z',
    },
    participants: [],
  };
}

describe('PgDealRoomBody — 계약 탭', () => {
  const awarded = (over: Partial<PgRfpDetailData> = {}) =>
    buildData({
      rfp: { ...baseRfp, status: 'awarded' },
      myBid: submittedBid,
      awardedToMe: true,
      buyerContact: {
        workspaceName: '(주)테스트',
        name: '구매 담당자',
        email: 'buyer@buy.com',
        phone: null,
      },
      ...over,
    });

  it('선정 + signing 이면 계약 탭이 첫 번째이고 기본으로 열린다', () => {
    render(<PgDealRoomBody data={awarded({ signing: signingView() })} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('계약');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('signing-tab')).toBeInTheDocument();
  });

  it('signing 이 없으면 계약 탭이 없고 견적 작성이 기본이다', () => {
    render(<PgDealRoomBody data={awarded()} />);
    expect(screen.queryByRole('tab', { name: /계약/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '견적 작성' })).toHaveAttribute('aria-selected', 'true');
  });

  it('견적 작성 탭의 요약 스트립을 누르면 계약 탭으로 간다', async () => {
    const user = userEvent.setup();
    render(<PgDealRoomBody data={awarded({ signing: signingView() })} />);
    await user.click(screen.getByRole('tab', { name: '견적 작성' }));
    await user.click(screen.getByRole('button', { name: /전자서명/ }));
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
  });
});
```

> `buildData` / `baseRfp` / `submittedBid` 은 이 파일에 이미 있다. `userEvent` 임포트가 없으면 파일 상단에 `import userEvent from '@testing-library/user-event';` 를, `PgRfpDetailData` 타입 임포트가 없으면 함께 추가한다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm test components/deal-room/pg/__tests__/PgDealRoomBody.test.tsx`
Expected: FAIL — 계약 탭이 없다

- [ ] **Step 3: 최소 구현을 작성한다**

`components/deal-room/pg/PgDealRoomBody.tsx`:

임포트 교체·추가:

```tsx
import { SigningTab } from '@/components/deal-room/signing/SigningTab';
import { SigningSummaryStrip } from '@/components/deal-room/signing/SigningSummaryStrip';
import { AwardContextLine } from '@/components/deal-room/signing/AwardContextLine';
import { buildSigningSummary } from '@/components/deal-room/signing/signing-view-model';
import { FileSignature } from 'lucide-react';
```

기본 탭:

```tsx
  const [tab, setTab] = useState(signing ? 'contract' : 'write');
```

`isAwarded && awardedToMe` 분기의 `writeContent` 에서 `SigningTab` 을 스트립으로 교체:

```tsx
    writeContent = (
      <div className="space-y-4">
        <DealResultHeader
          tone="award"
          title="이 견적이 선정됐어요"
          subtitle={myBid?.submittedAt ? <>보낸 시각 <LocalTime iso={myBid.submittedAt} /></> : undefined}
        >
          {buyerContact && <ContactBlock contact={buyerContact} counterpartyKind="buyer" />}
        </DealResultHeader>
        {signing && (
          <SigningSummaryStrip signing={signing} side="pg" onOpen={() => setTab('contract')} />
        )}
        {myBid && <SubmittedSummary rows={buildSubmittedSummaryRows(rfp, myBid)} />}
      </div>
    );
```

탭 배열:

```tsx
  const tabs: DealRoomTab[] = [
    ...(signing
      ? [
          {
            id: 'contract',
            label: '계약',
            content: (
              <>
                {buyerContact && (
                  <AwardContextLine
                    workspaceName={buyerContact.workspaceName}
                    contactName={buyerContact.name}
                    counterpartyWsId={rfp.buyerWsId}
                  />
                )}
                <SigningTab rfpCode={rfp.code} signing={signing} side="pg" />
              </>
            ),
          } satisfies DealRoomTab,
        ]
      : []),
    { id: 'write', label: '견적 작성', content: writeContent },
    // …기존 나머지 그대로…
```

레일 액션:

```tsx
  const actions: RailAction[] = [
    ...(signing
      ? [
          {
            id: 'contract',
            label: '계약',
            icon: <FileSignature />,
            dot: buildSigningSummary(signing, 'pg').dot,
            onSelect: () => setTab('contract'),
          } satisfies RailAction,
        ]
      : []),
    { id: 'write', label: '견적 작성', icon: <Pencil />, primary: true, onSelect: () => setTab('write') },
    // …기존 나머지 그대로…
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm test components/deal-room/pg`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add components/deal-room/pg/
git commit -m "feat(deal-room): PG 딜룸 계약 탭 신설(맨 앞·기본 활성)"
```

---

### Task 8: 문서 갱신 + 전체 검증

`SCREEN_DESIGN.md`의 B4·P3 행이 `SigningPanel`을 "결과 패널 아래"로 기술하고 있어 사실과 어긋나게 된다. `CLAUDE.md`의 전자서명 단락도 딜룸 표현을 갱신한다.

**Files:**
- Modify: `SCREEN_DESIGN.md` (B4 행, P3 행)
- Modify: `CLAUDE.md` (Domain Context 의 "선정 후 전자서명" 단락)

**Interfaces:**
- Consumes: 앞선 모든 Task 의 결과
- Produces: 없음

- [ ] **Step 1: `SCREEN_DESIGN.md` B4 행을 갱신한다**

B4 행에서 `**전자서명 패널**(`SigningPanel`, 선정 이후): 결과 패널 아래에 …` 로 시작하는 문장을 다음으로 교체한다:

```
**전자서명 '계약' 탭**(`SigningTab`, 선정 이후): `signing` 이 있으면 탭 배열 **맨 앞**에 `계약` 탭이 생기고 딜룸을 열 때 **기본 활성**이 된다(레일에도 상태 도트가 붙은 `계약` 액션). 탭 본문은 상단 한 줄 컨텍스트(`AwardContextLine` — 선정 PG·담당자·메시지) + 카드 3구역(상태 헤더 · 세로 서명 타임라인 · 액션 바) 고정 구조로, 8개 상태(`awaiting_pg_template`/`sent`/`in_progress`/`completed`/`declined`/`expired`/`canceled`/`send_failed`)가 같은 골격을 공유한다. 진행바는 타임라인에 흡수됐다. 견적 비교 탭에는 결과 패널 아래 38px 요약 스트립(`SigningSummaryStrip`)만 남아 클릭 시 계약 탭으로 이동한다. 계약이 없으면 탭·스트립 모두 없다.
```

같은 행 끝 컴포넌트 목록에서 `SigningPanel` 을 `SigningTab`, `SigningTimeline`, `SigningSummaryStrip`, `AwardContextLine` 으로 교체한다.

- [ ] **Step 2: `SCREEN_DESIGN.md` P3 행을 갱신한다**

P3 행에서 `**전자서명 패널**(`SigningPanel`, 본인 선정 시만): …` 문장을 다음으로 교체한다:

```
**전자서명 '계약' 탭**(`SigningTab`, 본인 선정 시만): B4 와 동일한 구조·컴포넌트를 공유하며 탭 맨 앞·기본 활성. 역할로 갈리는 것은 `awaiting_pg_template` 한 상태뿐 — PG 화면에서는 `계약서 템플릿을 등록해 주세요` + `서명 템플릿 등록하기`(→ `/signing-templates`) CTA 로 바뀐다(구매사 화면은 `PG사가 계약서를 준비하고 있어요` 대기 안내). 미선정 PG 는 서명 상태를 절대 못 본다(봉인 경계 — 서버 로더가 `awardedToMe` 일 때만 조회).
```

같은 행 끝 컴포넌트 목록에서 `SigningPanel` 을 `SigningTab`, `SigningSummaryStrip`, `AwardContextLine` 으로 교체한다.

- [ ] **Step 3: `CLAUDE.md` 를 갱신한다**

Domain Context 의 "선정 후 전자서명 (SnowSign Templates)" 단락에서 `딜룸 awarded 영역의 `SigningPanel` 이 상태(대기/진행/완료/거절)를 보여주고 …` 부분을 다음으로 교체한다:

```
딜룸의 전용 `계약` 탭(`SigningTab` — `signing` 이 있으면 탭 맨 앞·기본 활성, 레일 도트 + 다른 탭의 `SigningSummaryStrip` 한 줄이 상태를 알린다)이 8개 상태를 상태 헤더 · 세로 서명 타임라인 · 액션 바 3구역 고정 문법으로 보여주고 리마인더·취소·재발송·완료본 온디맨드 다운로드(1h URL 302 프록시, 로컬 보관 없음)를 노출한다. 상태 파생은 `components/deal-room/signing/signing-view-model.ts` 순수 함수가 단일 출처이며, 역할(buyer/pg)로 갈리는 것은 `awaiting_pg_template` 한 상태(PG 는 템플릿 등록 CTA)뿐이다.
```

- [ ] **Step 4: 전체 검증을 돌린다**

```bash
pnpm test
pnpm tsc --noEmit
pnpm lint
```

Expected: 전부 통과. 실패가 나오면 `origin/dev` 에서도 같은 실패가 나는지 먼저 확인한다(선존재 실패는 이 작업의 책임이 아니다 — PR 본문에 명시).

- [ ] **Step 5: 로컬에서 눈으로 확인한다**

```bash
pnpm dev
```

선정 완료된 견적 요청을 구매사 계정으로 열어 ① 계약 탭이 첫 번째이고 기본으로 열리는지 ② 상단 한 줄에 선정 PG·담당자가 보이는지 ③ 견적 비교 탭에 요약 스트립이 있는지 ④ 다크 모드에서 타임라인 선·디스크 대비가 살아있는지 확인한다. 선정된 PG 계정으로도 같은 화면을 열어 `awaiting_pg_template` 상태의 등록 CTA 를 확인한다.

- [ ] **Step 6: 커밋한다**

```bash
git add SCREEN_DESIGN.md CLAUDE.md
git commit -m "docs: 딜룸 전자서명 계약 탭 반영"
```

---

## 완료 조건

- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` 전부 green
- `components/deal-room/SigningPanel.tsx` 와 그 테스트가 저장소에서 사라졌고, 두 딜룸 body 가 `SigningTab` 을 쓴다
- 구매사·PG 딜룸 모두 `signing` 유무에 따라 계약 탭이 나타나고 사라진다(테스트로 고정)
- `SCREEN_DESIGN.md` B4·P3 와 `CLAUDE.md` 가 새 구조를 기술한다
