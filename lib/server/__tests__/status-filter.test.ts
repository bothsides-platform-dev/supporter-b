// Status filter — param token → domain status mapping.
// RFP: sidebar uses /rfp?status=draft|active|closed
//      'active' is not a domain enum value — it maps to domain 'sent'
// Inbox: sidebar uses /inbox?status=new|submitted|closed, mapped to bid-aware
//      PG kanban stages (classifyPgInvitation) — NOT invitation status:
//        'new'       → ['received']    (no bid / draft — 열람 여부 무관)
//        'submitted' → ['submitted']   (bid 제출됨)
//        'closed'    → ['won','lost']  (결과 — 선정/미선정 통합)
import { describe, it, expect } from 'vitest';

import {
  mapRfpParam,
  filterRfpsByParam,
  mapInboxParam,
  filterInboxRowsByParam,
} from '../status-filter';

import type { RFP } from '@/lib/types/rfp';
import type { InboxRow } from '@/components/inbox/InboxList';

// ── RFP param mapping ─────────────────────────────────────────────────────

describe('mapRfpParam', () => {
  it('draft is no longer a filter token (작성중 컬럼 제거) → undefined', () => {
    expect(mapRfpParam('draft')).toBeUndefined();
  });

  it('maps active → [sent] (sidebar token ≠ domain enum)', () => {
    expect(mapRfpParam('active')).toEqual(['sent']);
  });

  it('closed 토큰은 cancelled·awarded 를 폴드한다 (칸반 마감 컬럼과 동일 모집단)', () => {
    expect(mapRfpParam('closed')).toEqual(['closed', 'cancelled', 'awarded']);
  });

  it('awarded 토큰 제거 — 마감으로 폴드되어 undefined', () => {
    expect(mapRfpParam('awarded')).toBeUndefined();
  });

  it('returns undefined for unknown / missing param', () => {
    expect(mapRfpParam(undefined)).toBeUndefined();
    expect(mapRfpParam('')).toBeUndefined();
    expect(mapRfpParam('unknown')).toBeUndefined();
  });
});

// ── RFP list filter ───────────────────────────────────────────────────────

function makeRfp(status: RFP['status']): RFP {
  return {
    id: `id-${status}`,
    code: `P-0001-${status}`,
    buyerWsId: 'ws-buyer',
    title: `RFP ${status}`,
    memo: '',
    rfpFiles: [],
    allowedPgWorkspaceIds: [],
    requiredPaymentMethods: [],
    customPaymentMethods: [],
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    status,
    createdBy: 'u1',
    createdAt: new Date().toISOString(),
  };
}

const allRfps: RFP[] = [
  makeRfp('draft'),
  makeRfp('sent'),
  makeRfp('closed'),
  makeRfp('awarded'),
  makeRfp('cancelled'),
];

describe('filterRfpsByParam', () => {
  it('returns all rfps when param is undefined (bare /rfp)', () => {
    expect(filterRfpsByParam(allRfps, undefined)).toHaveLength(5);
  });

  it('param=draft returns empty (draft filter removed — drafts live in the unfiltered table)', () => {
    expect(filterRfpsByParam(allRfps, 'draft')).toHaveLength(0);
  });

  it('filters to sent (domain) when param=active', () => {
    const result = filterRfpsByParam(allRfps, 'active');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('sent');
  });

  it('param=closed 는 closed + cancelled + awarded 반환 (보드 마감 컬럼 딥링크 모집단 일치)', () => {
    const result = filterRfpsByParam(allRfps, 'closed');
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.status).sort()).toEqual(['awarded', 'cancelled', 'closed']);
  });

  it('param=awarded 는 빈 배열 (토큰 제거 — 마감으로 통합)', () => {
    expect(filterRfpsByParam(allRfps, 'awarded')).toHaveLength(0);
  });

  it('returns empty array for unknown param (no match)', () => {
    expect(filterRfpsByParam(allRfps, 'unknown')).toHaveLength(0);
  });
});

// ── Inbox param mapping ───────────────────────────────────────────────────

describe('mapInboxParam', () => {
  it('maps new → [received] (bid 미제출 — 열람 여부 무관)', () => {
    expect(mapInboxParam('new')).toEqual(['received']);
  });

  it('maps submitted → [submitted] (bid 제출됨)', () => {
    expect(mapInboxParam('submitted')).toEqual(['submitted']);
  });

  it('maps closed → [won, lost] (결과 — 선정/미선정 통합)', () => {
    expect(mapInboxParam('closed')).toEqual(['won', 'lost']);
  });

  it('returns undefined for unknown / missing param', () => {
    expect(mapInboxParam(undefined)).toBeUndefined();
    expect(mapInboxParam('')).toBeUndefined();
    expect(mapInboxParam('unknown')).toBeUndefined();
  });
});

// ── Inbox list filter ─────────────────────────────────────────────────────

function makeRow(stage: InboxRow['stage']): InboxRow {
  return {
    invitationId: `inv-${stage}`,
    stage,
    rfpId: `R-${stage}`,
    rfpTitle: `RFP ${stage}`,
    rfpDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    grade: '일반',
  };
}

const allRows: InboxRow[] = [
  makeRow('received'),
  makeRow('submitted'),
  makeRow('won'),
  makeRow('lost'),
];

describe('filterInboxRowsByParam', () => {
  it('returns all rows when param is undefined', () => {
    expect(filterInboxRowsByParam(allRows, undefined)).toHaveLength(4);
  });

  it('returns empty for unknown param', () => {
    expect(filterInboxRowsByParam(allRows, 'unknown')).toHaveLength(0);
  });

  it('filters to received rows when param=new', () => {
    const result = filterInboxRowsByParam(allRows, 'new');
    expect(result.map((r) => r.stage)).toEqual(['received']);
  });

  it('filters to submitted rows when param=submitted', () => {
    const result = filterInboxRowsByParam(allRows, 'submitted');
    expect(result.map((r) => r.stage)).toEqual(['submitted']);
  });

  it('filters to won+lost rows when param=closed', () => {
    const result = filterInboxRowsByParam(allRows, 'closed');
    expect(result.map((r) => r.stage)).toEqual(['won', 'lost']);
  });
});
