import { expect, it } from 'vitest';
import { queryInbox } from '../inbox-query';
import type { InboxRow } from '@/components/inbox/InboxList';

const now = new Date('2026-11-01T00:00:00Z');
const row = (id: number, over: Partial<InboxRow> = {}): InboxRow => ({
  invitationId: String(id),
  rfpId: `P-${String(id).padStart(4, '0')}`,
  rfpTitle: '결제 도입',
  buyerName: '긴 구매사',
  industryName: '쇼핑',
  grade: '일반',
  gradeRaw: 'general',
  requiredPaymentMethods: ['card'],
  stage: 'received',
  rfpStatus: 'sent',
  rfpDeadline: '2026-12-01T09:00:00Z',
  ...over,
});
it('prioritizes work and paginates hundreds of requests in stable result order', () => {
  const rows = Array.from({ length: 203 }, (_, i) => row(i, i < 3 ? { stage: 'submitted' } : {}));
  const first = queryInbox(rows, {}, now),
    last = queryInbox(rows, { page: '5' }, now);
  expect(first.rows).toHaveLength(50);
  expect(first.rows[0].rfpId).toBe('P-0003');
  expect(last.rows).toHaveLength(3);
  expect(last.rows[0].rfpId).toBe('P-0000');
  expect(first.counts.response).toBe(200);
  expect(first.counts.submitted).toBe(3);
});
it('shares filters between view counts and rows, including effective KST deadlines', () => {
  const rows = [
    row(1, { hasDraft: true }),
    row(2, { hasPendingRequote: true }),
    row(3, { industryName: '여행' }),
  ];
  const result = queryInbox(
    rows,
    {
      industry: '쇼핑',
      method: 'card',
      q: '긴 구매사',
      grade: 'general',
      from: '2026-12-01',
      to: '2026-12-01',
      status: 'draft',
    },
    now,
  );
  expect(result.counts).toMatchObject({
    '': 2,
    response: 2,
    revision: 1,
    draft: 1,
  });
  expect(result.rows.map((r) => r.rfpId)).toEqual(['P-0001']);
});
it('keeps submitted quotes awaiting buyer selection after intake closes', () => {
  const rows = [
    row(1, {
      stage: 'submitted',
      rfpDeadline: '2026-10-01T00:00:00Z',
      bidWindowOpen: false,
    }),
    row(2, { rfpDeadline: '2026-10-01T00:00:00Z' }),
  ];
  expect(queryInbox(rows, { status: 'submitted' }, now).rows.map((r) => r.rfpId)).toEqual([
    'P-0001',
  ]);
  expect(queryInbox(rows, { status: 'closed' }, now).rows.map((r) => r.rfpId)).toEqual(['P-0002']);
});
