import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RequestConditionsView } from '../RequestConditionsView';
import type { BuyerRfpDetailData } from '@/lib/server/rfp-detail-loader';

afterEach(() => {
  cleanup();
});

// 컴포넌트는 rfp·companyName·rfpFiles 만 읽는다 — 나머지 필드는 렌더 경로에
// 닿지 않으므로 캐스팅 픽스처로 좁힌다.
function makeData(rfpOverrides: Record<string, unknown>): BuyerRfpDetailData {
  return {
    rfp: {
      bizProfile: null,
      websiteUrl: undefined,
      mainProducts: undefined,
      annualPgVolume: undefined,
      currentFeeRate: undefined,
      currentSettlementCycle: undefined,
      currentSettlementLimit: undefined,
      currentGuaranteeInsurance: undefined,
      currentSolution: undefined,
      currentSolutionDetail: undefined,
      memo: undefined,
      ...rfpOverrides,
    },
    companyName: '테스트상사',
    rfpFiles: [],
  } as unknown as BuyerRfpDetailData;
}

describe('RequestConditionsView — 현재 운영 솔루션 표기', () => {
  it('self + 상세 입력 시 상세를 괄호로 덧붙인다', () => {
    render(
      <RequestConditionsView
        data={makeData({ currentSolution: 'self', currentSolutionDetail: 'ABC몰' })}
      />,
    );
    expect(screen.getByText('자체 개발 (ABC몰)')).toBeDefined();
  });

  it('other + 상세 입력 시에도 괄호 접미사가 붙는다', () => {
    render(
      <RequestConditionsView
        data={makeData({ currentSolution: 'other', currentSolutionDetail: '자체 ERP' })}
      />,
    );
    expect(screen.getByText('기타 (자체 ERP)')).toBeDefined();
  });

  it('self 인데 상세가 없으면 라벨만 표기한다', () => {
    render(<RequestConditionsView data={makeData({ currentSolution: 'self' })} />);
    expect(screen.getByText('자체 개발')).toBeDefined();
  });

  it('솔루션사 선택(cafe24)이면 상세가 있어도 덧붙이지 않는다', () => {
    render(
      <RequestConditionsView
        data={makeData({ currentSolution: 'cafe24', currentSolutionDetail: '무시될 값' })}
      />,
    );
    expect(screen.getByText('카페24')).toBeDefined();
    expect(screen.queryByText(/무시될 값/)).toBeNull();
  });

  it('어휘 밖 솔루션 값은 원문 그대로 보여준다 (solutionLabel fail-open — 구 데이터·수기 입력)', () => {
    render(<RequestConditionsView data={makeData({ currentSolution: 'shopify' })} />);
    expect(screen.getByText('shopify')).toBeDefined();
  });

  it('솔루션이 없으면 행이 생략되고, 다른 운영 필드도 없으면 섹션 자체가 사라진다', () => {
    render(<RequestConditionsView data={makeData({})} />);
    expect(screen.queryByText('현재 운영 솔루션')).toBeNull();
    expect(screen.queryByText('사업 운영 정보')).toBeNull();
  });

  it('운영 필드가 하나라도 있으면 섹션이 그려지고 빈 행은 생략된다', () => {
    render(<RequestConditionsView data={makeData({ mainProducts: '의류' })} />);
    expect(screen.getByText('사업 운영 정보')).toBeDefined();
    expect(screen.getByText('의류')).toBeDefined();
    expect(screen.queryByText('현재 운영 솔루션')).toBeNull();
  });
});
