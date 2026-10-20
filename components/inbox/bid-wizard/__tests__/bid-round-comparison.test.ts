// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareBidRounds, selectBidRounds } from '../bid-round-comparison';
import { historyRfp, roundBid } from './bid-round-fixtures';

describe('compareBidRounds', () => {
  it('pairs stable field IDs and reports money and percentage-point changes', () => {
    const result = compareBidRounds(historyRfp, roundBid(1), roundBid(2, {
      settleCycle: 'D+1', settleLimit: 10000000, signupFee: 100000,
      paymentFees: { card: { sole: 0.01, sme1: 0.02 } },
    }));
    expect(result.changedCount).toBe(5);
    expect(result.rows.find(r => r.id === 'settleCycle')).toMatchObject({ before: 'D+2', after: 'D+1', delta: '변경' });
    expect(result.rows.find(r => r.id === 'settleLimit')).toMatchObject({ before: '8,000,000원', after: '10,000,000원', delta: '+2,000,000원' });
    expect(result.rows.find(r => r.id === 'signupFee')).toMatchObject({ delta: '−50,000원' });
    expect(result.rows.find(r => r.id === 'payment:card:sole')).toMatchObject({ before: '1.20%', after: '1.00%', delta: '−0.20%p' });
    expect(result.rows.find(r => r.id === 'guaranteeInsurance')).toMatchObject({ before: '0원', after: '0원', changed: false });
  });

  it('keeps additions, removals, zero and duplicate custom labels distinct', () => {
    const result = compareBidRounds(historyRfp,
      roundBid(1, { paymentFees: { bank_transfer: 0, virtual_account: 200 }, customFees: { 'custom-a': 0.02 } }),
      roundBid(2, { paymentFees: { mobile: 0, virtual_account: 0 }, customFees: { 'custom-b': 0 } }),
    );
    expect(result.rows.find(r => r.id === 'payment:bank_transfer')).toMatchObject({ before: '0.00%', after: '—', delta: '삭제' });
    expect(result.rows.find(r => r.id === 'payment:mobile')).toMatchObject({ before: '—', after: '0.00%', delta: '추가' });
    expect(result.rows.find(r => r.id === 'payment:virtual_account')).toMatchObject({ before: '200원', after: '0원', delta: '−200원' });
    expect(result.rows.filter(r => r.label === '직접 결제')).toHaveLength(2);
    expect(result.rows.find(r => r.id === 'custom:custom-a')).toMatchObject({ after: '—' });
    expect(result.rows.find(r => r.id === 'custom:custom-b')).toMatchObject({ before: '—', after: '0.00%' });
  });

  it('compares legacy flat rates against every merchant tier without inventing missing rates', () => {
    const result = compareBidRounds(historyRfp,
      roundBid(1, { paymentFees: { card: 0.02, overseas_card: 0.03 } }),
      roundBid(2, { paymentFees: { card: { sole: 0, general: 0.02 }, overseas_card: 0.031 } }),
    );
    expect(result.rows.find(r => r.id === 'payment:card:sole')).toMatchObject({ before: '2.00%', after: '0.00%', delta: '−2.00%p' });
    expect(result.rows.find(r => r.id === 'payment:card:general')).toMatchObject({ changed: false });
    expect(result.rows.find(r => r.id === 'payment:card:sme1')).toMatchObject({ before: '2.00%', after: '—' });
    expect(result.rows.find(r => r.id === 'payment:overseas_card')).toMatchObject({ delta: '+0.10%p' });
  });

  it('unions tier IDs in either direction and preserves unentered settlement fields', () => {
    const result = compareBidRounds(historyRfp,
      roundBid(1, { settleCycle: '', settleLimit: undefined, paymentFees: { kakao_pay: { sole: 0.01 } } }),
      roundBid(2, { settleLimit: 0, paymentFees: { kakao_pay: { general: 0.02 } } }),
    );
    expect(result.rows.find(r => r.id === 'settleLimit')).toMatchObject({ before: '—', after: '0원', delta: '추가' });
    expect(result.rows.find(r => r.id === 'settleCycle')).toMatchObject({ before: '—', delta: '추가' });
    expect(result.rows.filter(r => r.id.startsWith('payment:'))).toHaveLength(2);
    expect(result.rows.find(r => r.id === 'payment:kakao_pay:sole')).toMatchObject({ delta: '삭제' });
    expect(result.rows.find(r => r.id === 'payment:kakao_pay:general')).toMatchObject({ delta: '추가' });
  });

  it('preserves historical tier maps for methods now entered as a single rate', () => {
    const result = compareBidRounds(historyRfp,
      roundBid(1, { paymentFees: { overseas_card: { general: 0.03 } } }),
      roundBid(2, { paymentFees: { overseas_card: { general: 0.025 } } }),
    );
    expect(result.rows.find(r => r.id === 'payment:overseas_card:general')).toMatchObject({
      label: '해외카드 · 일반', before: '3.00%', after: '2.50%', delta: '−0.50%p',
    });
    expect(result.changedCount).toBe(1);
  });

  it('counts only conditions and compares attachments as ID sets, ignoring URL and order', () => {
    const file = { id: 'f1', name: '견적.pdf', url: '/old', size: 10, mimeType: 'application/pdf' };
    const other = { ...file, id: 'f2' };
    const before = roundBid(1, { proposalPdfs: [file, other] });
    const same = compareBidRounds(historyRfp, before, roundBid(2, { proposalPdfs: [other, { ...file, url: '/new' }, file] }));
    expect(same).toMatchObject({ changedCount: 0, memoChanged: false, attachmentsChanged: false });
    const changed = compareBidRounds(historyRfp, before, roundBid(2, { memo: '메모만 수정', proposalPdfs: [file] }));
    expect(changed).toMatchObject({ changedCount: 0, memoChanged: true, attachmentsChanged: true });
  });
});

describe('selectBidRounds', () => {
  const bids = [roundBid(3), roundBid(1), roundBid(2)];
  it('defaults to the previous and latest rounds regardless of input order', () => {
    expect(selectBidRounds(bids)).toMatchObject({ before: { round: 2 }, after: { round: 3 } });
    expect(bids.map(b => b.round)).toEqual([3, 1, 2]);
  });
  it('retains valid choices and repairs missing or non-earlier baselines', () => {
    expect(selectBidRounds(bids, { beforeId: 'bid-1', afterId: 'bid-3' })).toMatchObject({ before: { round: 1 }, after: { round: 3 } });
    expect(selectBidRounds(bids, { beforeId: 'bid-2', afterId: 'bid-2' })).toMatchObject({ before: { round: 1 }, after: { round: 2 } });
    expect(selectBidRounds(bids, { beforeId: 'deleted', afterId: 'deleted' })).toMatchObject({ before: { round: 2 }, after: { round: 3 } });
    expect(selectBidRounds(bids, { afterId: 'bid-1' })).toMatchObject({ before: { round: 2 }, after: { round: 3 } });
  });
  it('handles empty and single-round history without a comparison', () => {
    expect(selectBidRounds([])).toMatchObject({ before: undefined, after: undefined });
    expect(selectBidRounds([roundBid(1)])).toMatchObject({ before: undefined, after: { round: 1 } });
  });
});
