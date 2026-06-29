import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  BidWizardProvider,
  useBidWizardContext,
  type BidWizardContextValue,
} from '../bid-wizard-context';

afterEach(cleanup);

// 컨텍스트가 노출해야 하는 형태를 고정하는 최소 더미 값.
function makeValue(over: Partial<BidWizardContextValue> = {}): BidWizardContextValue {
  return {
    cycleUnit: 'D',
    cycleNum: '1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    fees: {},
    memo: '',
    settleCycle: 'D+1',
    feeInputMethods: [],
    customPaymentMethods: [],
    proposal: null,
    pending: false,
    submitError: null,
    canSubmit: false,
    settlementAttempted: false,
    feesAttempted: false,
    setField: vi.fn(),
    setFee: vi.fn(),
    uploadProposal: vi.fn(),
    clearProposal: vi.fn(),
    advance: vi.fn(),
    back: vi.fn(),
    handleSubmit: vi.fn(),
    onSaveTemplate: vi.fn(async () => ({ ok: true as const })),
    ...over,
  };
}

function Consumer() {
  const ctx = useBidWizardContext();
  return <div data-testid="cycle">{ctx.settleCycle}</div>;
}

describe('useBidWizardContext', () => {
  it('프로바이더 밖에서 호출하면 throw', () => {
    // 콘솔 에러 소음 억제
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      /BidWizardProvider/,
    );
    spy.mockRestore();
  });

  it('프로바이더 안에서는 value 를 그대로 노출', () => {
    render(
      <BidWizardProvider value={makeValue({ settleCycle: 'M+2' })}>
        <Consumer />
      </BidWizardProvider>,
    );
    expect(screen.getByTestId('cycle').textContent).toBe('M+2');
  });
});
