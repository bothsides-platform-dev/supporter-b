import { describe, it, expect } from 'vitest';
import { resolveDrag } from '../dragMatrix';

describe('resolveDrag — buyer', () => {
  it('active → awarded: navigate-rfp-detail', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'awarded', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toEqual({ kind: 'navigate-rfp-detail', rfpId: 'P-2605-0001' });
  });

  it('active → closed: cancel-rfp', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'closed', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toEqual({ kind: 'cancel-rfp', rfpId: 'P-2605-0001', title: 'RFP 1' });
  });

  it('invalid: awarded → active (역방향)', () => {
    const a = resolveDrag({ role: 'buyer', from: 'awarded', to: 'active', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toBeNull();
  });

  it('invalid: same column', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'active', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toBeNull();
  });
});

describe('resolveDrag — pg', () => {
  it('received → submitted: navigate-inbox (form 작성·제출 필요)', () => {
    const a = resolveDrag({
      role: 'pg',
      from: 'received',
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

  it('invalid: received → won (직접 낙찰 불가)', () => {
    const a = resolveDrag({
      role: 'pg',
      from: 'received',
      to: 'won',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toBeNull();
  });

  it('invalid: same column', () => {
    const a = resolveDrag({
      role: 'pg',
      from: 'received',
      to: 'received',
      rfpId: 'P-2605-0001',
      title: 'RFP 1',
    });
    expect(a).toBeNull();
  });
});
