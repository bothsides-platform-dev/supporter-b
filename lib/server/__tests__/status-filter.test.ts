// Status filter — param token → domain status mapping.
// RFP: sidebar uses /rfp?status=draft|active|closed|awarded
//      'active' is not a domain enum value — it maps to domain 'sent'
// Inbox: sidebar uses /inbox?status=new|draft|submitted|closed
//      'new' → invitation 'sent', 'draft' → invitation 'opened',
//      'submitted' → invitation 'accepted', 'closed' → parent rfp 'closed'
//      (closed = RFP is no longer accepting bids, not an invitation status)
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
  it('maps draft → draft', () => {
    expect(mapRfpParam('draft')).toBe('draft');
  });

  it('maps active → sent (sidebar token ≠ domain enum)', () => {
    expect(mapRfpParam('active')).toBe('sent');
  });

  it('maps closed → closed', () => {
    expect(mapRfpParam('closed')).toBe('closed');
  });

  it('maps awarded → awarded', () => {
    expect(mapRfpParam('awarded')).toBe('awarded');
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

  it('filters to draft only when param=draft', () => {
    const result = filterRfpsByParam(allRfps, 'draft');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('draft');
  });

  it('filters to sent (domain) when param=active', () => {
    const result = filterRfpsByParam(allRfps, 'active');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('sent');
  });

  it('filters to closed when param=closed', () => {
    const result = filterRfpsByParam(allRfps, 'closed');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('closed');
  });

  it('filters to awarded when param=awarded', () => {
    const result = filterRfpsByParam(allRfps, 'awarded');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('awarded');
  });

  it('returns empty array for unknown param (no match)', () => {
    expect(filterRfpsByParam(allRfps, 'unknown')).toHaveLength(0);
  });
});

// ── Inbox param mapping ───────────────────────────────────────────────────

describe('mapInboxParam', () => {
  it('maps new → invitation sent', () => {
    const m = mapInboxParam('new');
    expect(m).toEqual({ kind: 'invStatus', value: 'sent' });
  });

  it('maps draft → invitation opened', () => {
    const m = mapInboxParam('draft');
    expect(m).toEqual({ kind: 'invStatus', value: 'opened' });
  });

  it('maps submitted → invitation accepted', () => {
    const m = mapInboxParam('submitted');
    expect(m).toEqual({ kind: 'invStatus', value: 'accepted' });
  });

  it('maps closed → rfp closed (parent RFP status, not invitation status)', () => {
    const m = mapInboxParam('closed');
    expect(m).toEqual({ kind: 'rfpStatus', value: 'closed' });
  });

  it('returns undefined for unknown / missing param', () => {
    expect(mapInboxParam(undefined)).toBeUndefined();
    expect(mapInboxParam('')).toBeUndefined();
  });
});

// ── Inbox list filter ─────────────────────────────────────────────────────

function makeRow(
  invitationStatus: string,
  rfpStatus: string = 'sent',
): InboxRow {
  return {
    invitationId: `inv-${invitationStatus}-${rfpStatus}`,
    invitationStatus,
    rfpStatus,
    rfpId: `R-${invitationStatus}`,
    rfpTitle: `RFP ${invitationStatus}`,
    rfpDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    grade: '일반',
  };
}

const allRows: InboxRow[] = [
  makeRow('sent'),     // new in UI
  makeRow('opened'),   // draft in UI
  makeRow('accepted'), // submitted in UI
  makeRow('draft', 'closed'),  // closed in UI (rfp closed, any inv status)
];

describe('filterInboxRowsByParam', () => {
  it('returns all rows when param is undefined', () => {
    expect(filterInboxRowsByParam(allRows, undefined)).toHaveLength(4);
  });

  it('filters to invitation-sent rows when param=new', () => {
    const result = filterInboxRowsByParam(allRows, 'new');
    expect(result).toHaveLength(1);
    expect(result[0].invitationStatus).toBe('sent');
  });

  it('filters to invitation-opened rows when param=draft', () => {
    const result = filterInboxRowsByParam(allRows, 'draft');
    expect(result).toHaveLength(1);
    expect(result[0].invitationStatus).toBe('opened');
  });

  it('filters to invitation-accepted rows when param=submitted', () => {
    const result = filterInboxRowsByParam(allRows, 'submitted');
    expect(result).toHaveLength(1);
    expect(result[0].invitationStatus).toBe('accepted');
  });

  it('filters to rfp-closed rows when param=closed', () => {
    const result = filterInboxRowsByParam(allRows, 'closed');
    expect(result).toHaveLength(1);
    expect(result[0].rfpStatus).toBe('closed');
  });
});
