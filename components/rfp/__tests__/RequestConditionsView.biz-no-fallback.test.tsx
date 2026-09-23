// Coverage: ISSUE-005 — 사업자번호가 없으면 포매터를 거치지 않고 '미입력' 을 유지한다
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RequestConditionsView } from '../RequestConditionsView';
import type { BuyerRfpDetailData } from '@/lib/server/rfp-detail-loader';

afterEach(cleanup);

function dataWith(bizProfile: unknown) {
  return {
    rfp: { bizProfile, requiredPaymentMethods: [], customPaymentMethods: [] },
    companyName: '테스트상사',
    rfpFiles: [],
  } as unknown as BuyerRfpDetailData;
}

describe('RequestConditionsView — 사업자번호 없음', () => {
  it('bizProfile 이 없으면 미입력으로 표시한다', () => {
    render(<RequestConditionsView data={dataWith(undefined)} />);
    expect(screen.getByText('미입력')).toBeInTheDocument();
  });

  it('bizNo 가 빈 문자열이면 미입력으로 표시한다', () => {
    render(<RequestConditionsView data={dataWith({ bizNo: '' })} />);
    expect(screen.getByText('미입력')).toBeInTheDocument();
  });
});
