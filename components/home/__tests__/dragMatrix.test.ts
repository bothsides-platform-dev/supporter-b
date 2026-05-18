import { describe, it, expect } from 'vitest';
import { resolveDrag } from '../dragMatrix';

describe('resolveDrag — buyer', () => {
  it('draft → sent: send-rfp', () => {
    const a = resolveDrag({
      role: 'buyer',
      from: 'draft',
      to: 'sent',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toEqual({
      kind: 'send-rfp',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
  });

  it('collecting → awarded: navigate-award', () => {
    const a = resolveDrag({
      role: 'buyer',
      from: 'collecting',
      to: 'awarded',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toEqual({ kind: 'navigate-rfp-detail', rfpId: 'P-2605-0001' });
  });

  it('comparing → awarded: navigate-award', () => {
    const a = resolveDrag({
      role: 'buyer',
      from: 'comparing',
      to: 'awarded',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toEqual({ kind: 'navigate-rfp-detail', rfpId: 'P-2605-0001' });
  });

  it('sent → closed: cancel-rfp', () => {
    const a = resolveDrag({
      role: 'buyer',
      from: 'sent',
      to: 'closed',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toEqual({
      kind: 'cancel-rfp',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
  });

  it('draft → closed: cancel-rfp', () => {
    const a = resolveDrag({
      role: 'buyer',
      from: 'draft',
      to: 'closed',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toEqual({
      kind: 'cancel-rfp',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
  });

  it('invalid: sent → awarded (이미 응답 있어야 함)', () => {
    const a = resolveDrag({
      role: 'buyer',
      from: 'sent',
      to: 'awarded',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toBeNull();
  });

  it('invalid: draft → awarded', () => {
    const a = resolveDrag({
      role: 'buyer',
      from: 'draft',
      to: 'awarded',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toBeNull();
  });

  it('invalid: collecting → sent (역방향)', () => {
    const a = resolveDrag({
      role: 'buyer',
      from: 'collecting',
      to: 'sent',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toBeNull();
  });

  it('invalid: same column', () => {
    const a = resolveDrag({
      role: 'buyer',
      from: 'collecting',
      to: 'collecting',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toBeNull();
  });
});

describe('resolveDrag — pg', () => {
  it('received → drafting: navigate-inbox', () => {
    const a = resolveDrag({
      role: 'pg',
      from: 'received',
      to: 'drafting',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toEqual({ kind: 'navigate-inbox', rfpId: 'P-2605-0001' });
  });

  it('reviewing → drafting: navigate-inbox', () => {
    const a = resolveDrag({
      role: 'pg',
      from: 'reviewing',
      to: 'drafting',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toEqual({ kind: 'navigate-inbox', rfpId: 'P-2605-0001' });
  });

  it('drafting → submitted: navigate-inbox (form 작성 필요)', () => {
    const a = resolveDrag({
      role: 'pg',
      from: 'drafting',
      to: 'submitted',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toEqual({ kind: 'navigate-inbox', rfpId: 'P-2605-0001' });
  });

  it('submitted → lost: withdraw-bid', () => {
    const a = resolveDrag({
      role: 'pg',
      from: 'submitted',
      to: 'lost',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
      bidId: 'bid-uuid-1',
    });
    expect(a).toEqual({
      kind: 'withdraw-bid',
      bidId: 'bid-uuid-1',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
  });

  it('submitted → lost without bidId: invalid', () => {
    const a = resolveDrag({
      role: 'pg',
      from: 'submitted',
      to: 'lost',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toBeNull();
  });

  it('invalid: received → submitted', () => {
    const a = resolveDrag({
      role: 'pg',
      from: 'received',
      to: 'submitted',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toBeNull();
  });

  it('invalid: drafting → won (직접 낙찰 불가)', () => {
    const a = resolveDrag({
      role: 'pg',
      from: 'drafting',
      to: 'won',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toBeNull();
  });

  it('invalid: same column', () => {
    const a = resolveDrag({
      role: 'pg',
      from: 'drafting',
      to: 'drafting',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toBeNull();
  });
});
