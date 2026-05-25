import { describe, it, expect } from 'vitest';
import { resolveDrag } from '../dragMatrix';

describe('resolveDrag — buyer', () => {
  it('draft → active: send-rfp', () => {
    const a = resolveDrag({ role: 'buyer', from: 'draft', to: 'active', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toEqual({ kind: 'send-rfp', rfpId: 'P-2605-0001', title: 'RFP 1' });
  });

  it('active → awarded: navigate-rfp-detail', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'awarded', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toEqual({ kind: 'navigate-rfp-detail', rfpId: 'P-2605-0001' });
  });

  it('active → closed: cancel-rfp', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'closed', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toEqual({ kind: 'cancel-rfp', rfpId: 'P-2605-0001', title: 'RFP 1' });
  });

  it('draft → closed: cancel-rfp', () => {
    const a = resolveDrag({ role: 'buyer', from: 'draft', to: 'closed', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toEqual({ kind: 'cancel-rfp', rfpId: 'P-2605-0001', title: 'RFP 1' });
  });

  it('invalid: draft → awarded (응답 단계 거치지 않음)', () => {
    const a = resolveDrag({ role: 'buyer', from: 'draft', to: 'awarded', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toBeNull();
  });

  it('invalid: active → draft (역방향)', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'draft', rfpId: 'P-2605-0001', title: 'RFP 1' });
    expect(a).toBeNull();
  });

  it('invalid: same column', () => {
    const a = resolveDrag({ role: 'buyer', from: 'active', to: 'active', rfpId: 'P-2605-0001', title: 'RFP 1' });
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
